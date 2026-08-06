export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'app-a',
    timestamp: new Date().toISOString(),
  });
}
