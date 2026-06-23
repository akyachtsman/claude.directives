import Counter from '../components/Counter';
// import { createClient } from '../lib/supabase-server';

// A Server Component (the default): renders on the server, so data fetching and
// SEO content are server-side. It can read Supabase server-side; interactive
// bits are delegated to Client Components like <Counter/>.
export default async function Home() {
  // Example server-side read (anon + RLS by default). Uncomment once you have a
  // table and the env vars set:
  //   const supabase = await createClient();
  //   const { data: items } = await supabase.from('items').select('*').limit(10);

  return (
    <main className="container">
      <section className="card">
        <h1>Production tier — Next.js + Vercel + Supabase</h1>
        <p>
          This page is server-rendered (good for SEO and fast first paint). The
          button below is an interactive Client Component.
        </p>
        <Counter />
      </section>
    </main>
  );
}
