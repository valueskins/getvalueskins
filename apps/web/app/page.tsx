import { APP_NAME } from '@valueskins/shared';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <h1>{APP_NAME}</h1>
    </main>
  );
}
