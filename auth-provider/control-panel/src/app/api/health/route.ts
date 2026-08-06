export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'control-panel',
    timestamp: new Date().toISOString(),
  });
}
