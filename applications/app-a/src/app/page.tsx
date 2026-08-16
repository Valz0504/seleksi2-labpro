interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  const callbackFailed = query['login_error'] === 'oauth_callback_failed';
  const requestId = typeof query['request_id'] === 'string' ? query['request_id'] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">App A</span>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Masuk ke App A</h1>
        <p className="mt-3 leading-7 text-slate-600">Belum ada local session.</p>

        {callbackFailed ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>Login tidak dapat diselesaikan. Silakan mulai ulang proses login.</p>
            {requestId ? (
              <p className="mt-1 text-xs text-red-700">Request ID: {requestId}</p>
            ) : null}
          </div>
        ) : null}

        <form action="/auth/login" method="post" className="mt-6">
          <button
            type="submit"
            className="h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
          >
            Login melalui Auth Provider
          </button>
        </form>
      </section>
    </main>
  );
}
