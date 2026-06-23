import './globals.css';

export const metadata = {
  title: 'App',
  description: 'Production-tier app — Next.js + Vercel + Supabase.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
