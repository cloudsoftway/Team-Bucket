
interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
  userId?: number; // Optional user ID if authentication is not needed
}

export interface TeamMember {
  id: number;
  name: string;
  email?: string;
  job_title?: string;
  department?: string;
  active?: boolean;
  employee_id?: number; // Primary employee ID (first from employee_ids)
  employee_ids?: number[]; // All linked employee IDs
  vacations?: Vacation[];
  capacity?: number; // Capacity percentage (0-100)
}

export interface Vacation {
  id: number;
  date_from: string;
  date_to: string;
  request_unit_half?: boolean;
  request_unit_hours?: boolean;
  number_of_days?: number;
  employee_id?: [number, string];
}

export interface Project {
  id: number;
  name: string;
  user_id?: [number, string]; // Tuple: [id, name] - Project Manager
  x_project_owner?: [number, string]; // Tuple: [id, name] - Project Owner
  x_project_reviewer?: [number, string]; // Tuple: [id, name] - Project Reviewer
  active?: boolean;
}

export interface ProjectTask {
  id: number;
  name: string;
  description?: string;
  activity_ids?: number[];
  priority?: string;
  tag_ids?: number[];
  display_name?: string;
  date_end?: string;
  date_assign?: string;
  user_ids?: number[];
  date_deadline?: string;
  activity_state?: string;
  activity_user_id?: [number, string] | false;
  activity_type_id?: [number, string] | false;
  access_url?: string;
  stage_id?: [number, string];
  rating_ids?: number[];
  rating_count?: number;
  activity_date_deadline?: string;
  allocated_hours?: number;
  project_id?: [number, string] | false;
}

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params: any;
  id: number;
}

/**
 * Exact JSON-RPC payload for execute_kw write (stored in Redis, executed by worker).
 * Format:
 * {
 *   "jsonrpc": "2.0",
 *   "method": "call",
 *   "params": {
 *     "service": "object",
 *     "method": "execute_kw",
 *     "args": [ database, uid, apiKey, model, "write", [ [ids], { "user_ids": [[4, id], ...] } ] ]
 *   },
 *   "id": number
 * }
 */
export interface OdooWriteRpcPayload {
  jsonrpc: '2.0';
  method: 'call';
  params: {
    service: 'object';
    method: 'execute_kw';
    args: [string, number, string, string, 'write', [number[], Record<string, any>]];
  };
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

class OdooClient {
  private config: OdooConfig;
  private uid: number | null = null;
  private requestId: number = 1;
  private connectionTimeout: number;
  private requestTimeout: number;

  constructor(config: OdooConfig) {
    this.config = config;
    // Connection timeout: time to establish connection (default 10 seconds)
    this.connectionTimeout = process.env.ODOO_CONNECTION_TIMEOUT 
      ? parseInt(process.env.ODOO_CONNECTION_TIMEOUT, 10) 
      : 10000;
    // Request timeout: time for entire request including response (default 30 seconds)
    this.requestTimeout = process.env.ODOO_REQUEST_TIMEOUT 
      ? parseInt(process.env.ODOO_REQUEST_TIMEOUT, 10) 
      : 30000;
  }

  private getJsonRpcUrl(): string {
    const baseUrl = this.config.url.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/jsonrpc`;
  }

  private async jsonRpcCall(method: string, params: any): Promise<any> {
    const url = new URL(this.getJsonRpcUrl());
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId++,
    };

    try {
      const requestBody = JSON.stringify(request);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? await import('https') : await import('http');

      return new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody),
          },
        };

        const req = httpModule.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (requestTimeout) {
              clearTimeout(requestTimeout);
              requestTimeout = null;
            }
            if (connectionTimeout) {
              clearTimeout(connectionTimeout);
              connectionTimeout = null;
            }
            try {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                const response: JsonRpcResponse = JSON.parse(data);

                if (response.error) {
                  // Log more details for debugging
                  console.error('Odoo JSON-RPC error response:', JSON.stringify(response.error, null, 2));
                  console.error('Request that failed:', JSON.stringify(request, null, 2));
                  
                  const errorMessage = response.error.data 
                    ? `${response.error.message}: ${JSON.stringify(response.error.data)}`
                    : response.error.message;
                    
                  reject(
                    new Error(
                      `Odoo JSON-RPC error: ${errorMessage} (code: ${response.error.code})`
                    )
                  );
                } else {
                  resolve(response.result);
                }
              } else {
                reject(
                  new Error(
                    `HTTP error! status: ${res.statusCode}. Response: ${data.substring(0, 500)}. Check if Odoo URL is correct: ${this.config.url}`
                  )
                );
              }
            } catch (parseError: any) {
              console.error('Failed to parse response:', data);
              reject(new Error(`Failed to parse response: ${parseError.message}. Response data: ${data.substring(0, 500)}`));
            }
          });
        });

        // Set socket timeout for connection establishment
        req.setTimeout(this.connectionTimeout, () => {
          req.destroy();
        });

        // Connection timeout: triggers if connection cannot be established
        let connectionTimeout: NodeJS.Timeout | null = setTimeout(() => {
          req.destroy();
          connectionTimeout = null;
          if (requestTimeout) {
            clearTimeout(requestTimeout);
            requestTimeout = null;
          }
          reject(
            new Error(
              `Connection timeout: Could not connect to Odoo server within ${this.connectionTimeout}ms. ` +
              `Check if Odoo server is running and accessible at ${this.config.url}`
            )
          );
        }, this.connectionTimeout);

        // Request timeout: triggers if entire request (including response) takes too long
        let requestTimeout: NodeJS.Timeout | null = setTimeout(() => {
          req.destroy();
          requestTimeout = null;
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          reject(
            new Error(
              `Request timeout: Odoo API call exceeded ${this.requestTimeout}ms. ` +
              `The server may be slow or unresponsive. Check ${this.config.url}`
            )
          );
        }, this.requestTimeout);

        // Socket timeout event (alternative way to catch connection issues)
        req.on('timeout', () => {
          req.destroy();
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          if (requestTimeout) {
            clearTimeout(requestTimeout);
            requestTimeout = null;
          }
          reject(
            new Error(
              `Socket timeout: Connection to Odoo server timed out after ${this.connectionTimeout}ms. ` +
              `Check if Odoo server is running and accessible at ${this.config.url}`
            )
          );
        });

        req.on('error', (error: any) => {
          if (requestTimeout) {
            clearTimeout(requestTimeout);
            requestTimeout = null;
          }
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          if (error.code === 'ECONNRESET') {
            reject(
              new Error(
                `Connection reset by Odoo server. Check if URL is correct (${this.config.url}), server is running, and network is accessible.`
              )
            );
          } else if (error.code === 'ENOTFOUND') {
            reject(new Error(`Cannot resolve hostname. Check if Odoo URL is correct: ${this.config.url}`));
          } else if (error.code === 'ECONNREFUSED') {
            reject(
              new Error(
                `Connection refused. Check if Odoo server is running and accessible at ${this.config.url}`
              )
            );
          } else if (error.code === 'ETIMEDOUT') {
            reject(
              new Error(
                `Connection timeout: Could not connect to Odoo server. ` +
                `Check if Odoo server is running and accessible at ${this.config.url}`
              )
            );
          } else {
            reject(new Error(`Odoo API call failed: ${error.message || 'Unknown error'} (code: ${error.code || 'N/A'})`));
          }
        });

        req.write(requestBody);
        req.end();
      });
    } catch (error: any) {
      throw new Error(`Odoo API call failed: ${error.message || 'Unknown error'}`);
    }
  }

  private async authenticate(): Promise<number> {
    if (this.uid) {
      return this.uid;
    }

    try {
      // Try using the API key with a login call first
      // Some Odoo setups require username/password for authentication, then API key for calls
      const result = await this.jsonRpcCall('call', {
        service: 'common',
        method: 'authenticate',
        args: [this.config.database, this.config.username, this.config.apiKey, {}],
      });

      if (!result || typeof result !== 'number') {
        throw new Error(`Odoo authentication failed: Invalid credentials or database name. Result: ${JSON.stringify(result)}`);
      }

      this.uid = result;
      return result;
    } catch (error: any) {
      console.error('Authentication error details:', {
        database: this.config.database,
        username: this.config.username,
        url: this.config.url,
        error: error.message,
      });
      
      if (error.message.includes('authentication')) {
        throw error;
      }
      throw new Error(`Odoo authentication failed: ${error.message}`);
    }
  }

  async getTeamMembers(): Promise<TeamMember[]> {
    try {
      let uid: number;
      
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
        console.log(`Using provided user ID: ${uid}`);
      } else {
        try {
          uid = await this.authenticate();
        } catch (authError: any) {
          console.error('Authentication failed. Consider providing ODOO_USER_ID environment variable.');
          throw authError;
        }
      }

      const users = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,  
          uid,                    
          this.config.apiKey,     
          'res.users',            
          'search_read',          
          [],                     
          {                       
            fields: ['id', 'name', 'email', 'active', 'project_ids', 'employee_ids', 'task_ids'],
          },
        ],
      });

      if (!users || users.length === 0) {
        return [];
      }

      return users.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email || undefined,
        active: user.active !== false,
        // Odoo returns employee_ids as an array of IDs; take the first as primary employee_id
        employee_id: Array.isArray(user.employee_ids) && user.employee_ids.length > 0 ? user.employee_ids[0] : undefined,
        employee_ids: Array.isArray(user.employee_ids) ? user.employee_ids : undefined,
      }));
    } catch (error) {
      console.error('Error fetching team members:', error);
      throw error;
    }
  }

  async getProjects(): Promise<Project[]> {
    try {
      let uid: number;

      // If user ID is provided in config, use it directly (skip authentication)
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // Use search_read method to get projects (matching Postman format)
      const projects = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.project',
          'search_read',
          [],
          {
            fields: ['id', 'name', 'user_id', 'active', 'x_project_owner', 'x_project_reviewer'],
          },
        ],
      });

      if (!projects || projects.length === 0) {
        return [];
      }

      return projects.map((project: any) => ({
        id: project.id,
        name: project.name,
        user_id: project.user_id || undefined, // Tuple: [id, name] - Project Manager
        x_project_owner: project.x_project_owner, // Project Owner
        x_project_reviewer: project.x_project_reviewer,
        active: project.active !== false
      }));
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  async getProjectById(projectId: number): Promise<Project | null> {
    try {
      let uid: number;

      // If user ID is provided in config, use it directly (skip authentication)
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // Use search_read with domain to get a specific project
      // Domain format: [[["id", "=", projectId]]]
      const domain = [[['id', '=', projectId]]];
      console.log(`Fetching project with domain: ${JSON.stringify(domain)}`);
      
      const projects = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.project',
          'search_read',
          domain, // [[["id", "=", projectId]]]
          {
            fields: ['id', 'name', 'user_id', 'active', 'x_project_owner', 'x_project_reviewer'],
          },
        ],
      });

      if (!projects || projects.length === 0) {
        return null;
      }

      const project = projects[0];
      return {
        id: project.id,
        name: project.name,
        user_id: project.user_id || undefined, // Tuple: [id, name] - Project Manager
        x_project_owner: project.x_project_owner, // Tuple: [id, name] - Project Owner
        x_project_reviewer: project.x_project_reviewer, // Tuple: [id, name] - Project Reviewer
        active: project.active !== false,
      };
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  }

  async getProjectTasks(projectId: number): Promise<ProjectTask[]> {
    try {
      let uid: number;

      // If user ID is provided in config, use it directly (skip authentication)
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // Use search_read with domain to get tasks for a specific project
      // Domain format: [[["project_id", "=", projectId]]]
      const domain = [[['project_id', '=', projectId]]];
      console.log(`Fetching project tasks with domain: ${JSON.stringify(domain)}`);

      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          domain, // [[["project_id", "=", projectId]]]
          {
            fields: [
              'id',
              'name',
              'description',
              'activity_ids',
              'priority',
              'tag_ids',
              'display_name',
              'date_end',
              'date_assign',
              'user_ids',
              'date_deadline',
              'activity_state',
              'activity_user_id',
              'activity_type_id',
              'access_url',
              'stage_id',
              'rating_ids',
              'rating_count',
              'activity_date_deadline',
              'allocated_hours',
            ],
          },
        ],
      });

      if (!tasks || tasks.length === 0) {
        return [];
      }

      return tasks.map((task: any) => ({
        id: task.id,
        name: task.name,
        description: task.description || undefined,
        activity_ids: task.activity_ids || undefined,
        priority: task.priority || undefined,
        tag_ids: task.tag_ids || undefined,
        display_name: task.display_name || undefined,
        date_end: task.date_end || undefined,
        date_assign: task.date_assign || undefined,
        user_ids: task.user_ids || undefined,
        date_deadline: task.date_deadline || undefined,
        activity_state: task.activity_state || undefined,
        activity_user_id: task.activity_user_id || undefined,
        activity_type_id: task.activity_type_id || undefined,
        access_url: task.access_url || undefined,
        stage_id: task.stage_id || undefined,
        rating_ids: task.rating_ids || undefined,
        rating_count: task.rating_count || undefined,
        activity_date_deadline: task.activity_date_deadline || undefined,
        allocated_hours: task.allocated_hours ?? undefined,
      }));
    } catch (error) {
      console.error('Error fetching project tasks:', error);
      throw error;
    }
  }

  async getProjectMembers(projectId: number): Promise<TeamMember[]> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // First, get all tasks for the project and extract user_ids
      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [[['project_id', '=', projectId]]],
          {
            fields: ['user_ids'],
          },
        ],
      });

      // Extract unique user IDs from all tasks
      const userIds = [...new Set(tasks.flatMap((task: any) => task.user_ids || []))];

      if (userIds.length === 0) {
        return [];
      }

      // Fetch user details for those user IDs
      const users = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'res.users',
          'search_read',
          [[['id', 'in', userIds]]],
          {
            fields: ['id', 'name', 'email', 'active'],
          },
        ],
      });

      if (!users || users.length === 0) {
        return [];
      }

      return users.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email || undefined,
        active: user.active,
      }));
    } catch (error) {
      console.error('Error fetching project members:', error);
      throw error;
    }
  }

  async getMembersNotInvolvedInProjects(projectIds: number[]): Promise<TeamMember[]> {
    try {
      let uid: number;
      // Same auth pattern as getProjectMembers
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // 1) Get all tasks for the given projects and collect user_ids
      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [[['project_id', 'in', projectIds]]],
          {
            fields: ['user_ids'],
          },
        ],
      });

      const involvedUserIds: number[] = [
        ...new Set(
          (tasks as any[]).flatMap((task) =>
            Array.isArray(task.user_ids) ? (task.user_ids as number[]) : []
          )
        ),
      ];

      // If no one is involved in these projects, "not involved" = all users
      if (involvedUserIds.length === 0) {
        const allUsers = await this.jsonRpcCall('call', {
          service: 'object',
          method: 'execute_kw',
          args: [
            this.config.database,
            uid,
            this.config.apiKey,
            'res.users',
            'search_read',
            [],
            {
              fields: ['id', 'name', 'email', 'active'],
            },
          ],
        });

        if (!allUsers || (allUsers as any[]).length === 0) {
          return [];
        }

        return (allUsers as any[]).map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email || undefined,
          active: user.active !== false,
        }));
      }

      // 2) Fetch users whose id is NOT in involvedUserIds
      const nonMembers = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'res.users',
          'search_read',
          [[['id', 'not in', involvedUserIds]]],
          {
            fields: ['id', 'name', 'email', 'active'],
          },
        ],
      });

      if (!nonMembers || (nonMembers as any[]).length === 0) {
        return [];
      }

      return (nonMembers as any[]).map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email || undefined,
        active: user.active !== false,
      }));
    } catch (error) {
      console.error('Error fetching members not involved in projects:', error);
      throw error;
    }
  }
  
  async getUnassignedTasks(projectIds?: number[]): Promise<ProjectTask[]> {
    try {
      let uid: number;

      // If user ID is provided in config, use it directly (skip authentication)
      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      const domain: any[] = [['user_ids', '=', false], ["stage_id.fold", "=", false], ["stage_id.name", "in", ["Prioritized", "Refined", "Backlog"]]
    ];
      if (projectIds && projectIds.length > 0) {
        domain.push(['project_id', 'in', projectIds]);
      }


      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [domain],
          {
            fields: [
              'id',
              'name',
              'description',
              'priority',
              'tag_ids',
              'display_name',
              'user_ids',
              'allocated_hours',
              'date_deadline',
              'activity_user_id',
              'access_url',
              'stage_id',
              'project_id'
            ],
          },
        ],
      });

      if (!tasks || tasks.length === 0) {
        return [];
      }

      return tasks as ProjectTask[];
      } catch (error) {
      console.error('Error fetching unassigned tasks:', error);
      throw error;
    }
  }

  async getEmployeeIdByUserId(userId: number): Promise<number | null> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // Using the exact format from the API example:
      // Domain: [["user_id", "=", userId]]
      // Fields: ["id", "name"]
      const employees = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'hr.employee',
          'search_read',
          [[['user_id', '=', userId]]], // Domain: [["user_id", "=", userId]]
          {
            fields: ['id', 'name'], // Fields: ["id", "name"]
          },
        ],
      });

      if (!employees || employees.length === 0) {
        console.log(`No employee found for user_id ${userId}`);
        return null;
      }

      return employees[0].id;
    } catch (error) {
      console.error(`Error fetching employee ID for user ${userId}:`, error);
      return null;
    }
  }

  async getEmployeeIdsByUserIds(userIds: number[]): Promise<Map<number, number>> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      if (userIds.length === 0) {
        return new Map();
      }

      // Fetch all employees for multiple user IDs in a single call
      // Domain: [["user_id", "in", [userId1, userId2, ...]]]
      const employees = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'hr.employee',
          'search_read',
          [[['user_id', 'in', userIds]]], // Domain: [["user_id", "in", userIds]]
          {
            fields: ['id', 'name', 'user_id'], // Include user_id to map back
          },
        ],
      });

      const userIdToEmployeeId = new Map<number, number>();

      if (employees && employees.length > 0) {
        employees.forEach((employee: any) => {
          const userId = Array.isArray(employee.user_id) ? employee.user_id[0] : employee.user_id;
          if (userId && employee.id) {
            userIdToEmployeeId.set(userId, employee.id);
          }
        });
      }

      return userIdToEmployeeId;
    } catch (error) {
      console.error(`Error fetching employee IDs for users:`, error);
      return new Map();
    }
  }

  async getOpenTasksForUser(
    userId: number,
    startDate: string,
    endDate: string
  ): Promise<ProjectTask[]> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      // [[["stage_id.fold", "=", false], ["user_ids", "in", [userId]], 
      //   ["date_deadline", ">=", startDate], ["date_deadline", "<=", endDate],
      //   ["stage_id.name", "in", ["In Progress"]]]]
      const domain: any[] = [
        ['stage_id.fold', '=', false],
        ['user_ids', 'in', [userId]],
        ['date_deadline', '>=', startDate],
        ['date_deadline', '<=', endDate],
        ['stage_id.name', 'in', ['In Progress', 'Prioritized']],
      ];

      console.log(`Fetching open tasks for user ${userId} with domain: ${JSON.stringify([domain])}`);

      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [domain], // Double-wrapped: [[...]]
          {
            fields: ['name',
              'description',
              'priority',
              'tag_ids',
              'display_name',
              'user_ids',
              'allocated_hours',
              'date_deadline',              
              'activity_user_id',
              'access_url',
              'stage_id',],
          },
        ],
      });

      if (!tasks || tasks.length === 0) {
        return [];
      }

      return tasks.map((task: any) => ({
        id: task.id,
        name: task.name,
        date_deadline: task.date_deadline || undefined,
        user_ids: task.user_ids || undefined,
        allocated_hours: task.allocated_hours || 0,
      }));
    } catch (error) {
      console.error(`Error fetching open tasks for user ${userId}:`, error);
      throw error;
    }
  }

  // Fetch open tasks for multiple users in a single Odoo call
  async getOpenTasksForUsers(
    userIds: number[],
    startDate: string,
    endDate: string
  ): Promise<ProjectTask[]> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      if (!userIds || userIds.length === 0) {
        return [];
      }

      // Domain equivalent to the JSON-RPC example, but with dynamic userIds and date range:
      // [
      //   ["stage_id.fold", "=", false],
      //   ["user_ids", "in", userIds],
      //   ["date_deadline", ">=", startDate],
      //   ["date_deadline", "<=", endDate],
      //   ["stage_id.name", "in", ["In Progress", "Prioritized"]]
      // ]
      const domain: any[] = [
        ['stage_id.fold', '=', false],
        ['user_ids', 'in', userIds],
        ['date_deadline', '>=', startDate],
        ['date_deadline', '<=', endDate],
        ['stage_id.name', 'in', ['In Progress', 'Prioritized']],
      ];

      console.log(
        `Fetching open tasks for multiple users ${JSON.stringify(
          userIds
        )} with domain: ${JSON.stringify([domain])}`
      );

      const tasks = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [domain], // [[...]]
          {
            fields: [
              'name',
              'description',
              'priority',
              'tag_ids',
              'display_name',
              'user_ids',
              'allocated_hours',
              'date_deadline',
              'activity_user_id',
              'access_url',
              'stage_id',
              'project_id',
            ],
          },
        ],
      });

      if (!tasks || tasks.length === 0) {
        return [];
      }

      return tasks.map((task: any) => ({
        id: task.id,
        name: task.name,
        date_deadline: task.date_deadline || undefined,
        user_ids: task.user_ids || undefined,
        allocated_hours: task.allocated_hours || 0,
        project_id: task.project_id || undefined,
      }));
    } catch (error) {
      console.error(`Error fetching open tasks for users ${userIds}:`, error);
      throw error;
    }
  }

  async getVacationsForEmployees(
    employeeIds: number[],
    startDate: string,
    endDate: string
  ): Promise<Vacation[]> {
    try {
      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      if (employeeIds.length === 0) {
        return [];
      }

      const domain: any[] = [
        ['employee_id', 'in', employeeIds],
        ['state', '=', 'validate'],
      ];

      console.log(
        `Fetching vacations for employees ${JSON.stringify(
          employeeIds
        )} with domain: ${JSON.stringify([domain])}`
      );

      const vacations = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'hr.leave',
          'search_read',
          [domain],
          {
            fields: [
              'date_from',
              'date_to',
              'request_unit_half',
              'request_unit_hours',
              'number_of_days',
              'employee_id',
            ],
          },
        ],
      });

      const allVacations = vacations || [];

      // Map the results to match the Vacation interface
      return allVacations.map((vacation: any) => ({
        id: vacation.id || 0,
        date_from: vacation.date_from || '',
        date_to: vacation.date_to || '',
        request_unit_half: vacation.request_unit_half || undefined,
        request_unit_hours: vacation.request_unit_hours || undefined,
        number_of_days: vacation.number_of_days || undefined,
        employee_id: vacation.employee_id || undefined,
      }));
    } catch (error) {
      console.error('Error fetching vacations:', error);
      throw error;
    }
  }
  async getCurrentTaskStatus(taskIds: number[]): Promise<any[]> {
    try {
      if (!taskIds || taskIds.length === 0) {
        return [];
      }

      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      const result = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.task',
          'search_read',
          [
            [
              ['id', 'in', taskIds]
            ]
          ],
          {
            fields: [
              'id',
              'name',
              'user_ids',
              'allocated_hours',
              'effective_hours',
              'stage_id',
              'date_deadline',
              'project_id'
            ]
          }
        ]
      });

      return result || [];
    } catch (error) {
      console.error('Error fetching current task status from Odoo:', error);
      throw error;
    }
  }

  async getCurrentProjectStatus(projectIds: number[]): Promise<any[]> {
    try {
      if (!projectIds || projectIds.length === 0) {
        return [];
      }

      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      const result = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          'project.project',
          'search_read',
          [
            [
              ['id', 'in', projectIds]
            ]
          ],
          {
            fields: ['id', 'name', 'user_id', 'active']
          }
        ]
      });

      return result || [];
    } catch (error) {
      console.error('Error fetching current project status from Odoo:', error);
      throw error;
    }
  }

  /**
   */
  generateAddMemberToTeamRpcCalls(projectStatuses: Array<{
    original: any;
    upcoming: any;
    action: any;
    additional_info?: any;
  }>): Array<{
    model: string;
    method: string;
    ids: number[];
    values: Record<string, any>;
    actionId: string;
  }> {
    const rpcCalls: Array<{
      model: string;
      method: string;
      ids: number[];
      values: Record<string, any>;
      actionId: string;
    }> = [];

    // Group by project ID to merge user_ids for the same project
    const projectUserMap = new Map<number, {
      userIds: [number, number][];
      actionIds: string[];
    }>();

    for (const status of projectStatuses) {
      try {
        const action = status.action;
        const projectIds = action.condition_json?.project_ids;
        const userIds = action.update_json?.user_ids;

        if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
          console.warn(`Invalid add_to_team action ${action.id}: missing projectIds`);
          continue;
        }

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
          console.warn(`Invalid add_to_team action ${action.id}: missing userIds`);
          continue;
        }

        // Normalize to Odoo format: [[4, userId], ...] (4 = link existing record)
        const extractedUserIds: [number, number][] = [];
        for (const userIdEntry of userIds) {
          if (Array.isArray(userIdEntry) && userIdEntry.length >= 2 && userIdEntry[0] === 4) {
            extractedUserIds.push([4, userIdEntry[1]]);
          } else if (typeof userIdEntry === 'number') {
            extractedUserIds.push([4, userIdEntry]);
          }
        }

        if (extractedUserIds.length === 0) {
          console.warn(`Invalid add_to_team action ${action.id}: no valid user IDs found`);
          continue;
        }

        for (const projectId of projectIds) {
          if (!projectUserMap.has(projectId)) {
            projectUserMap.set(projectId, { userIds: [], actionIds: [] });
          }
          const projectData = projectUserMap.get(projectId)!;
          for (const userIdTuple of extractedUserIds) {
            const userId = userIdTuple[1];
            if (!projectData.userIds.some((t) => t[1] === userId)) {
              projectData.userIds.push(userIdTuple);
            }
          }
          projectData.actionIds.push(action.id);
        }
      } catch (error: any) {
        console.error(`Error processing project status for action ${status.action?.id}:`, error);
      }
    }

    // Build RPC payloads: write(project.project, [id], { user_ids: [[4, id], ...] })
    for (const [projectId, projectData] of projectUserMap.entries()) {
      if (projectData.userIds.length === 0) continue;

      const primaryActionId = projectData.actionIds[0];

      // Structure matches: execute_kw(..., "write", [ [ids], { user_ids } ])
      rpcCalls.push({
        model: 'project.project',
        method: 'write',
        ids: [projectId], // [283] → args[5] = [ [283], { user_ids } ]
        values: {
          user_ids: projectData.userIds, // [[4, 31], ...] as in Odoo JSON-RPC
        },
        actionId: primaryActionId,
      });
    }

    return rpcCalls;
  }

  /**
   * Generate RPC calls for assigning tasks to members.
   * Output format matches Odoo JSON-RPC execute_kw write:
   * {
   *   "jsonrpc": "2.0",
   *   "method": "call",
   *   "params": {
   *     "service": "object",
   *     "method": "execute_kw",
   *     "args": [ "cloudsoftway", 31, "API_KEY", "project.task", "write", [ [1689], { "user_ids": [[6, 0, [31]]], "date_deadline": "2026-02-05", "allocated_hours": 8, "stage_id": 89 } ] ]
   *   },
   *   "id": 1
   * }
   * Note: user_ids uses Odoo replace format [[6, 0, [ids]]] to replace all existing links.
   * @param taskStatuses - Array of task status objects from checkOdooStatus
   * @returns Array of RPC call objects ready to be executed
   */
  generateAssignTasksToMembersRpcCalls(taskStatuses: Array<{
    original: any;
    upcoming: any;
    action: any;
    additional_info?: any;
  }>): Array<{
    model: string;
    method: string;
    ids: number[];
    values: Record<string, any>;
    actionId: string;
  }> {
    const rpcCalls: Array<{
      model: string;
      method: string;
      ids: number[];
      values: Record<string, any>;
      actionId: string;
    }> = [];

    // Group by task ID to merge user_ids and other fields for the same task
    const taskDataMap = new Map<number, {
      userIds: number[]; 
      actionIds: string[];
      otherFields: Record<string, any>; // date_deadline, allocated_hours, stage_id, etc.
    }>();

    for (const status of taskStatuses) {
      try {
        const action = status.action;
        const taskId = action.condition_json?.id;
        const updateJson = action.update_json || {};

        if (!taskId) {
          console.warn(`Invalid assign action ${action.id}: missing taskId`);
          continue;
        }

        const userIds = updateJson.user_ids;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
          console.warn(`Invalid assign action ${action.id}: missing userIds`);
          continue;
        }

        // Extract user IDs from various formats
        const extractedUserIds: number[] = [];
        for (const userIdEntry of userIds) {
          if (typeof userIdEntry === 'number') {
            extractedUserIds.push(userIdEntry);
          } else if (Array.isArray(userIdEntry) && userIdEntry.length >= 2) {
            extractedUserIds.push(userIdEntry[1]);
          }
        }

        if (extractedUserIds.length === 0) {
          console.warn(`Invalid assign action ${action.id}: no valid user IDs found`);
          continue;
        }

        // Initialize task entry if it doesn't exist
        if (!taskDataMap.has(taskId)) {
          taskDataMap.set(taskId, {
            userIds: [],
            actionIds: [],
            otherFields: {},
          });
        }

        const taskData = taskDataMap.get(taskId)!;
        
        // Merge user IDs, avoiding duplicates
        for (const userId of extractedUserIds) {
          if (!taskData.userIds.includes(userId)) {
            taskData.userIds.push(userId);
          }
        }
        
      
        for (const [key, value] of Object.entries(updateJson)) {
          if (key !== 'user_ids' && value !== undefined && value !== null) {
            taskData.otherFields[key] = value;
          }
        }
        
        taskData.actionIds.push(action.id);
      } catch (error: any) {
        console.error(`Error processing task status for action ${status.action?.id}:`, error);
      }
    }

    for (const [taskId, taskData] of taskDataMap.entries()) {
      if (taskData.userIds.length > 0) {
        const primaryActionId = taskData.actionIds[0];

       
        const userIdsReplaceFormat: [6, 0, number[]][] = [[6, 0, taskData.userIds]];

        const values: Record<string, any> = {
          user_ids: userIdsReplaceFormat,
          ...taskData.otherFields,
        };

        rpcCalls.push({
          model: 'project.task',
          method: 'write',
          ids: [taskId],
          values,
          actionId: primaryActionId,
        });
      }
    }

    return rpcCalls;
  }

  
  async applyActions(statusResult: {
    isReady: boolean;
    taskStatuses: Array<{
      original: any;
      upcoming: any;
      action: any;
      additional_info?: any;
    }>;
    projectStatuses: Array<{
      original: any;
      upcoming: any;
      action: any;
      additional_info?: any;
    }>;
  }): Promise<{
    success: boolean;
    total: number;
    successful: number;
    failed: number;
    results: Array<{ actionId: string; success: boolean; error?: string }>;
    queued?: boolean;
    message?: string;
  }> {
    try {
      if (!statusResult.isReady) {
        return {
          success: false,
          total: 0,
          successful: 0,
          failed: 0,
          results: [],
        };
      }

      const allRpcCalls: Array<{
        model: string;
        method: string;
        ids: number[];
        values: Record<string, any>;
        actionId: string;
      }> = [];

      // Generate RPC calls for adding team members
      if (statusResult.projectStatuses.length > 0) {
        const addTeamMemberCalls = this.generateAddMemberToTeamRpcCalls(statusResult.projectStatuses);
        console.log('Generated add team member RPC calls:', addTeamMemberCalls);
        allRpcCalls.push(...addTeamMemberCalls);
      }

      // Generate RPC calls for task assignments
      if (statusResult.taskStatuses.length > 0) {
        const assignTaskCalls = this.generateAssignTasksToMembersRpcCalls(statusResult.taskStatuses);
        console.log('Generated assign task RPC calls:', assignTaskCalls);
        allRpcCalls.push(...assignTaskCalls);
      }

      // Build exact JSON-RPC payloads and enqueue for worker
      if (allRpcCalls.length > 0) {
        const { enqueueRpcCalls } = await import('./redis');
        const items: Array<{ payload: import('./odoo').OdooWriteRpcPayload; actionId: string }> = [];
        for (const c of allRpcCalls) {
          const payload = await this.buildWriteRpcPayload(c.model, c.ids, c.values);
          // Log full JSON so args[5] ([ids, values]) is visible; plain console.log shows it as [Array]
          console.log('rpc built:', JSON.stringify(payload, null, 2));
          items.push({ payload, actionId: c.actionId });
        }
        await enqueueRpcCalls(items);
        console.log(`Enqueued ${items.length} RPC calls (exact JSON-RPC) to Redis queue`);
      }

      return {
        success: true,
        total: allRpcCalls.length,
        successful: 0, // Will be updated by worker
        failed: 0, // Will be updated by worker
        results: [], // Results will be available via worker
        queued: true,
        message: `${allRpcCalls.length} RPC calls queued for asynchronous execution`,
      };
    } catch (error) {
      console.error('Error applying actions:', error);
      throw error;
    }
  }


  async checkOdooStatus(actions: any[]): Promise<{
    isReady: boolean;
    taskStatuses: Array<{
      original: any; // Current state from Odoo
      upcoming: any; // Planned state from action
      action: any;
    }>;
    projectStatuses: Array<{
      original: any; // Current state from Odoo
      upcoming: any; // Planned state from action
      action: any;
    }>;
  }> {
    try {
      const result = {
        isReady: false,
        taskStatuses: [] as Array<{ original: any; upcoming: any; action: any; additional_info?: any }>,
        projectStatuses: [] as Array<{ original: any; upcoming: any; action: any; additional_info?: any }>,
      };

      if (!actions || actions.length === 0) {
        console.log('No actions provided to check');
        return result;
      }

      // Group actions by action_type
      const assignActions = actions.filter(action => action.action_type === 'assign');
      const addToTeamActions = actions.filter(action => action.action_type === 'add_to_team');

      // Process assign actions (tasks)
      if (assignActions.length > 0) {
        const taskIds = assignActions
          .filter(action => action.entity_type === 'project.task')
          .map(action => action.entity_id);
        
        if (taskIds.length > 0) {
          const currentTaskStatuses = await this.getCurrentTaskStatus(taskIds);
          
          if (!currentTaskStatuses || currentTaskStatuses.length === 0) {
            console.error('Tasks not found in Odoo:', taskIds);
            return result;
          }

          // Match each action with its corresponding Odoo task
          for (const action of assignActions.filter(a => a.entity_type === 'project.task')) {
            const original = currentTaskStatuses.find((task: any) => task.id === action.entity_id);
            if (original) {
              result.taskStatuses.push({
                original,
                upcoming: action.after_state || {},
                action,
                additional_info: action.additional_info_json || {},
              });
            }
          }
        }
      }

      // Process add_to_team actions (projects)
      if (addToTeamActions.length > 0) {
        // Extract and flatten project IDs from condition_json
        const projectIds: number[] = [];
        addToTeamActions
          .filter(action => action.entity_type === 'project.project' && action.condition_json?.project_ids)
          .forEach(action => {
            const ids = action.condition_json.project_ids;
            if (Array.isArray(ids)) {
              projectIds.push(...ids);
            }
          });
        
        // Remove duplicates
        const uniqueProjectIds = [...new Set(projectIds)];
        
        if (uniqueProjectIds.length > 0) {
          const currentProjectStatuses = await this.getCurrentProjectStatus(uniqueProjectIds);
          
          // Match each action with its corresponding Odoo project
          for (const action of addToTeamActions.filter(a => a.entity_type === 'project.project')) {
            const projectIdsInAction = action.condition_json?.project_ids || [];
            for (const projectId of projectIdsInAction) {
              const original = currentProjectStatuses.find((project: any) => project.id === projectId);
              if (original) {
                result.projectStatuses.push({
                  original,
                  upcoming: action.after_state || {},
                  additional_info: action.additional_info_json || {},
                  action,
                });
              }
            }
          }
        }
      }
    
      result.isReady = true;
      return result;
    } catch (error) {
      console.error('Error checking Odoo status:', error);
      return {
        isReady: false,
        taskStatuses: [],
        projectStatuses: [],
      };
    }
  }

  
  async write(model: string, ids: number[], values: Record<string, any>): Promise<boolean> {
    try {
      if (!ids || ids.length === 0) {
        throw new Error('At least one record ID is required');
      }

      if (!values || Object.keys(values).length === 0) {
        throw new Error('At least one field value is required');
      }

      let uid: number;

      if (this.config.userId) {
        uid = this.config.userId;
        this.uid = uid;
      } else {
        uid = await this.authenticate();
      }

      const result = await this.jsonRpcCall('call', {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          uid,
          this.config.apiKey,
          model,
          'write',
          [ids, values], // [ids array, values object] - Odoo write format
        ],
      });

      // Odoo write returns True on success
      return result === true;
    } catch (error) {
      console.error(`Error writing to ${model}:`, error);
      throw error;
    }
  }

  async buildWriteRpcPayload(
    model: string,
    ids: number[],
    values: Record<string, any>,
    rpcId: number = this.requestId++
  ): Promise<OdooWriteRpcPayload> {
    if (!ids?.length || !values || Object.keys(values).length === 0) {
      throw new Error('ids and values required');
    }
    let uid: number;
    if (this.config.userId) {
      uid = this.config.userId;
      this.uid = uid;
    } else {
      uid = await this.authenticate();
    }

    const writePayload: [number[], Record<string, any>] = [ids, values];
    const args: [string, number, string, string, 'write', [number[], Record<string, any>]] = [
      this.config.database,
      uid,
      this.config.apiKey,
      model,
      'write',
      writePayload,
    ];
    return {
      jsonrpc: '2.0',
      method: 'call',
      params: { service: 'object', method: 'execute_kw', args },
      id: rpcId,
    };
  }
}

export function createOdooClient(): OdooClient {
  const config = {
    url: process.env.ODOO_URL || '',
    database: process.env.ODOO_DATABASE || '',
    username: process.env.ODOO_USERNAME || '',
    apiKey: process.env.ODOO_API_KEY || '',
    userId: process.env.ODOO_USER_ID ? parseInt(process.env.ODOO_USER_ID, 10) : undefined,
  };

  if (!config.url || !config.database || !config.username || !config.apiKey) {
    throw new Error('Odoo configuration is incomplete. Please check your environment variables.');
  }

  return new OdooClient(config);
}

/**
 * Check the current Odoo status (convenience function that creates client internally)
 * @param actions Array of actions to check
 * @returns Promise with current and planned states
 */
export async function checkOdooStatus(actions: any[]): Promise<{
  isReady: boolean;
  taskStatuses: Array<{
    original: any;
    upcoming: any;
    action: any;
  }>;
  projectStatuses: Array<{
    original: any;
    upcoming: any;
    action: any;
  }>;
}> {
  const odooClient = createOdooClient();
  return await odooClient.checkOdooStatus(actions);
}
