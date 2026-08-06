export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'app-b',
    timestamp: new Date().toISOString(),
  });
}
