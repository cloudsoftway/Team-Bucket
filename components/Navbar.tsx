'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Project } from '@/lib/odoo';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  
  // Working configuration state
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState<number>(5);
  const [averageWeeklyHours, setAverageWeeklyHours] = useState<number>(40);
  const [dailyWorkingHours, setDailyWorkingHours] = useState<number>(8);
  const [isEditingDays, setIsEditingDays] = useState(false);
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [isEditingDailyHours, setIsEditingDailyHours] = useState(false);
  const [tempDaysValue, setTempDaysValue] = useState<string>('5');
  const [tempHoursValue, setTempHoursValue] = useState<string>('40');
  const [tempDailyHoursValue, setTempDailyHoursValue] = useState<string>('8');

  // Vacation date range state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedCW, setSelectedCW] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

  // Get ISO week number for a date
  const getISOWeek = (date: Date): { year: number; week: number } => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  };

  // Calculate week date range using ISO-8601
  const getWeekDateRange = (isoYear: number, isoWeek: number) => {
    // Jan 4 is always in CW 1
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));

    // Day of week (1 = Monday, 7 = Sunday)
    const dayOfWeek = jan4.getUTCDay() || 7;

    // Monday of CW 1
    const cw1Monday = new Date(jan4);
    cw1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

    // Target week Monday
    const weekStart = new Date(cw1Monday);
    weekStart.setUTCDate(cw1Monday.getUTCDate() + (isoWeek - 1) * 7);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Sunday end
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  };

  useEffect(() => {
    // Load saved values from localStorage
    const savedDays = localStorage.getItem('workingDaysPerWeek');
    const savedHours = localStorage.getItem('averageWeeklyHours');
    const savedDailyHours = localStorage.getItem('dailyWorkingHours');
    const savedStartDate = localStorage.getItem('vacationStartDate');
    const savedEndDate = localStorage.getItem('vacationEndDate');
    const savedCW = localStorage.getItem('selectedCW');
    
    if (savedDays) {
      setWorkingDaysPerWeek(parseInt(savedDays, 10));
      setTempDaysValue(savedDays);
    }
    if (savedHours) {
      setAverageWeeklyHours(parseInt(savedHours, 10));
      setTempHoursValue(savedHours);
    }
    if (savedDailyHours) {
      setDailyWorkingHours(parseInt(savedDailyHours, 10));
      setTempDailyHoursValue(savedDailyHours);
    }
    
    // Set current year
    const now = new Date();
    setCurrentYear(now.getFullYear());
    
    // If CW is saved, restore it and calculate dates
    if (savedCW) {
      setSelectedCW(savedCW);
      const cwNumber = parseInt(savedCW, 10);
      if (!isNaN(cwNumber) && cwNumber >= 1 && cwNumber <= 52) {
        const { weekStart, weekEnd } = getWeekDateRange(now.getFullYear(), cwNumber);
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
        localStorage.setItem('vacationStartDate', startStr);
        localStorage.setItem('vacationEndDate', endStr);
      }
    } else {
      // Load dates if no CW is set
      if (savedStartDate) {
        setStartDate(savedStartDate);
      }
      if (savedEndDate) {
        setEndDate(savedEndDate);
      }
    }
  }, []);


  const handleProjectSelect = (projectId: number) => {
    router.push(`/project/${projectId}`);
    setIsOpen(false);
  };

  const handleDaysSave = () => {
    const value = parseInt(tempDaysValue, 10);
    if (!isNaN(value) && value > 0 && value <= 7) {
      setWorkingDaysPerWeek(value);
      localStorage.setItem('workingDaysPerWeek', value.toString());
      setIsEditingDays(false);
    }
  };

  const handleDaysCancel = () => {
    setTempDaysValue(workingDaysPerWeek.toString());
    setIsEditingDays(false);
  };

  const handleHoursSave = () => {
    const value = parseInt(tempHoursValue, 10);
    if (!isNaN(value) && value > 0 && value <= 168) {
      setAverageWeeklyHours(value);
      localStorage.setItem('averageWeeklyHours', value.toString());
      setIsEditingHours(false);
    }
  };

  const handleHoursCancel = () => {
    setTempHoursValue(averageWeeklyHours.toString());
    setIsEditingHours(false);
  };

  const handleDailyHoursSave = () => {
    const value = parseInt(tempDailyHoursValue, 10);
    if (!isNaN(value) && value > 0 && value <= 24) {
      setDailyWorkingHours(value);
      localStorage.setItem('dailyWorkingHours', value.toString());
      setIsEditingDailyHours(false);
      // Dispatch event to notify Dashboard to recalculate vacations
      window.dispatchEvent(new CustomEvent('vacationDatesChanged'));
    }
  };

  const handleDailyHoursCancel = () => {
    setTempDailyHoursValue(dailyWorkingHours.toString());
    setIsEditingDailyHours(false);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartDate(value);
    localStorage.setItem('vacationStartDate', value);
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('vacationDatesChanged'));
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedCW) return; // Don't allow editing when CW is selected
    const value = e.target.value;
    setEndDate(value);
    localStorage.setItem('vacationEndDate', value);
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent('vacationDatesChanged'));
  };

  const handleCWChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCW(value);
    
    if (value) {
      // Calculate dates for selected CW
      const cwNumber = parseInt(value, 10);
      if (!isNaN(cwNumber) && cwNumber >= 1 && cwNumber <= 52) {
        const { weekStart, weekEnd } = getWeekDateRange(currentYear, cwNumber);
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];
        setStartDate(startStr);
        setEndDate(endStr);
        localStorage.setItem('vacationStartDate', startStr);
        localStorage.setItem('vacationEndDate', endStr);
        localStorage.setItem('selectedCW', value);
        window.dispatchEvent(new CustomEvent('vacationDatesChanged'));
      }
    } else {
      // Clear CW - allow manual date editing
      localStorage.removeItem('selectedCW');
    }
  };

  return (
    <nav className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b-2 border-zinc-200 dark:border-zinc-800 shadow-lg sticky top-0 z-50">
      <div className="w-full px-6 py-4">
        <div className="flex items-center gap-4 overflow-x-auto">
          <a
            href="/"
            className="flex items-center gap-3 text-xl font-bold text-black dark:text-zinc-50 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
          >
            {/* Bucket Logo */}
            <img 
              src="/designer.png" 
              alt="Team Bucket Logo" 
              className="h-15 w-15 hover:scale-110 transition-transform"
            />
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent font-bold text-xl">Team Bucket</span>
          </a>

          {/* Working Configuration */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Working Days Per Week */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-800">
              {isEditingDays ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={tempDaysValue}
                    onChange={(e) => setTempDaysValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDaysSave();
                      if (e.key === 'Escape') handleDaysCancel();
                    }}
                    className="w-16 px-3 py-1.5 text-sm border-2 border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleDaysSave}
                    className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm hover:shadow-md"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleDaysCancel}
                    className="px-3 py-1.5 text-xs font-semibold bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-all"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Days/Week:
                  </span>
                  <span className="text-sm font-bold text-blue-900 dark:text-blue-100 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg shadow-sm">
                    {workingDaysPerWeek}
                  </span>
                  <button
                    onClick={() => setIsEditingDays(true)}
                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                    title="Edit working days per week"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Average Weekly Hours */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 px-4 py-2 rounded-xl border border-purple-200 dark:border-purple-800 flex-shrink-0">
              {isEditingHours ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={tempHoursValue}
                    onChange={(e) => setTempHoursValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleHoursSave();
                      if (e.key === 'Escape') handleHoursCancel();
                    }}
                    className="w-20 px-3 py-1.5 text-sm border-2 border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleHoursSave}
                    className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm hover:shadow-md"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleHoursCancel}
                    className="px-3 py-1.5 text-xs font-semibold bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-all"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">
                    Hours/Week:
                  </span>
                  <span className="text-sm font-bold text-purple-900 dark:text-purple-100 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg shadow-sm">
                    {averageWeeklyHours}
                  </span>
                  <button
                    onClick={() => setIsEditingHours(true)}
                    className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-all"
                    title="Edit average weekly hours"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Daily Working Hours */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
              {isEditingDailyHours ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={tempDailyHoursValue}
                    onChange={(e) => setTempDailyHoursValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDailyHoursSave();
                      if (e.key === 'Escape') handleDailyHoursCancel();
                    }}
                    className="w-16 px-3 py-1.5 text-sm border-2 border-emerald-300 dark:border-emerald-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleDailyHoursSave}
                    className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm hover:shadow-md"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleDailyHoursCancel}
                    className="px-3 py-1.5 text-xs font-semibold bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-all"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                    Daily:
                  </span>
                  <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100 bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg shadow-sm">
                    {dailyWorkingHours}h
                  </span>
                  <button
                    onClick={() => setIsEditingDailyHours(true)}
                    className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-all"
                    title="Edit daily working hours"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Calendar Week Dropdown */}
            <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide whitespace-nowrap">
                CW:
              </span>
              <select
                value={selectedCW}
                onChange={handleCWChange}
                className="px-3 py-1.5 text-sm border-2 border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm font-medium cursor-pointer"
              >
                <option value="">-- Select --</option>
                {Array.from({ length: 52 }, (_, i) => i + 1).map((week) => (
                  <option key={week} value={week.toString()}>
                    CW {week}
                  </option>
                ))}
              </select>
            </div>

            {/* Vacation Date Range */}
            <div className="flex items-center gap-3 border-l-2 border-indigo-200 dark:border-indigo-800 pl-6 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 px-4 py-2 rounded-xl flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide whitespace-nowrap">
                Period:
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={handleStartDateChange}
                  readOnly={!!selectedCW}
                  className={`px-2 py-1.5 text-xs border-2 border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium min-w-[120px] ${
                    selectedCW ? 'cursor-not-allowed opacity-75' : ''
                  }`}
                  placeholder="Start Date"
                />
                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={handleEndDateChange}
                  readOnly={!!selectedCW}
                  className={`px-2 py-1.5 text-xs border-2 border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium min-w-[120px] ${
                    selectedCW ? 'cursor-not-allowed opacity-75' : ''
                  }`}
                  placeholder="End Date"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
