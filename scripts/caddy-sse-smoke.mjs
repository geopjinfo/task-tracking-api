const baseUrl=(process.env.CADDY_BASE_URL??'http://localhost').replace(/\/$/,'');
const response=await fetch(`${baseUrl}/api/v1/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:`caddy-smoke-${Date.now()}@example.test`,displayName:'Caddy Smoke',password:'correct horse battery staple'})});
if(!response.ok)throw new Error(`Registration through Caddy failed with ${response.status}`);
const body=await response.json();
if(typeof body?.accessToken!=='string')throw new Error('Registration did not return an access token');
for(let attempt=1;attempt<=2;attempt+=1){
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),10000);
  const stream=await fetch(`${baseUrl}/api/v1/notifications/stream`,{headers:{authorization:`Bearer ${body.accessToken}`},signal:abort.signal});
  if(!stream.ok||!stream.body)throw new Error(`SSE attempt ${attempt} failed with ${stream.status}`);
  if(!stream.headers.get('content-type')?.startsWith('text/event-stream'))throw new Error('Caddy did not preserve the SSE content type');
  const reader=stream.body.getReader();
  const first=await reader.read();
  clearTimeout(timer);
  if(!new TextDecoder().decode(first.value).includes('event: connected'))throw new Error(`SSE attempt ${attempt} did not stream the connection event`);
  abort.abort();
  await reader.cancel().catch(()=>undefined);
}
const health=await fetch(`${baseUrl}/health/live`);
if(!health.ok)throw new Error(`Proxied health check failed with ${health.status}`);
if(health.headers.get('x-content-type-options')!=='nosniff')throw new Error('Expected security headers were not preserved');
const oversized=await fetch(`${baseUrl}/api/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(2*1024*1024)})});
if(oversized.status!==413)throw new Error(`Caddy request limit returned ${oversized.status}, expected 413`);
console.log('Caddy proxy routing and SSE reconnect smoke passed');
