export async function onRequest(context) {
  try {
    const response = await context.next();
    
    // Add CORS headers to all responses
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
  } catch (error) {
    // If everything fails, return basic error response
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Middleware error',
      message: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}