import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black font-sans pb-12">
      <div className="container mx-auto py-8 px-6">
        <Dashboard />
      </div>
    </div>
  );
}
