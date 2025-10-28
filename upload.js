export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  console.log('📨 Request received:', {
    method: request.method,
    pathname: url.pathname,
    origin: request.headers.get('origin')
  });

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, *',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // API Routes
    if (url.pathname.startsWith('/api/')) {
      return await handleAPI(request, env, url);
    }

    // Serve static files
    const response = await env.ASSETS.fetch(request);
    console.log('📄 Serving static file:', url.pathname);
    return response;
    
  } catch (error) {
    console.error('💥 Main handler error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Server error',
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

async function handleAPI(request, env, url) {
  try {
    console.log('🔧 API Request:', url.pathname);

    // Test R2 bucket connection first
    if (url.pathname === '/api/test-r2') {
      return await testR2Connection(env);
    }

    switch (url.pathname) {
      case '/api/upload':
        return await handleUpload(request, env);
      case '/api/health':
        return handleHealthCheck();
      case '/api/config':
        return handleConfig(env);
      case '/api/videos':
        return await handleListVideos(env);
      default:
        return jsonResponse({ 
          success: false,
          error: 'Endpoint not found' 
        }, 404);
    }
  } catch (error) {
    console.error('💥 API Error:', error);
    return jsonResponse({ 
      success: false,
      error: 'Internal server error',
      message: error.message,
      stack: error.stack
    }, 500);
  }
}

async function testR2Connection(env) {
  try {
    if (!env.VIDEO_BUCKET) {
      return jsonResponse({
        success: false,
        error: 'VIDEO_BUCKET not found',
        details: 'R2 binding mungkin belum dikonfigurasi'
      }, 500);
    }

    // Test basic R2 operation
    const buckets = await env.VIDEO_BUCKET.list();
    
    return jsonResponse({
      success: true,
      message: 'R2 connection successful',
      bucketInfo: {
        name: 'video-uploads',
        totalObjects: buckets.objects.length,
        objects: buckets.objects.map(obj => ({
          key: obj.key,
          size: obj.size
        }))
      }
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: 'R2 connection failed',
      details: error.message
    }, 500);
  }
}

async function handleUpload(request, env) {
  console.log('🚀 Upload request started');
  
  if (request.method !== 'POST') {
    return jsonResponse({ 
      success: false,
      error: 'Method not allowed' 
    }, 405);
  }

  // Check R2 bucket availability
  if (!env.VIDEO_BUCKET) {
    console.error('❌ VIDEO_BUCKET not available');
    return jsonResponse({ 
      success: false,
      error: 'Storage bucket not configured',
      details: 'VIDEO_BUCKET binding missing. Pastikan R2 bucket sudah dibuat dan binding dikonfigurasi di wrangler.toml'
    }, 500);
  }

  // Check content length
  const contentLength = request.headers.get('content-length');
  console.log('📏 Content length:', contentLength);

  if (!contentLength || parseInt(contentLength) === 0) {
    return jsonResponse({ 
      success: false,
      error: 'Empty request body' 
    }, 400);
  }

  let formData;
  try {
    const contentType = request.headers.get('content-type') || '';
    console.log('📋 Content-Type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ 
        success: false,
        error: 'Content-Type must be multipart/form-data',
        received: contentType 
      }, 400);
    }

    // Parse form data
    formData = await request.formData();
    console.log('✅ FormData parsed successfully');

  } catch (parseError) {
    console.error('❌ FormData parse error:', parseError);
    return jsonResponse({ 
      success: false,
      error: 'Invalid form data',
      details: parseError.message 
    }, 400);
  }

  const file = formData.get('video');
  
  if (!file) {
    console.log('❌ No file found in form data');
    return jsonResponse({ 
      success: false,
      error: 'No video file provided' 
    }, 400);
  }

  console.log('📁 File info:', {
    name: file.name,
    size: file.size,
    type: file.type
  });

  // Validate file type
  if (!file.type.startsWith('video/')) {
    return jsonResponse({ 
      success: false,
      error: 'Only video files are allowed',
      received: file.type 
    }, 400);
  }

  // Validate file size (100MB max)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return jsonResponse({ 
      success: false,
      error: `File too large. Maximum size is 100MB`,
      received: `${(file.size / 1024 / 1024).toFixed(2)}MB`
    }, 400);
  }

  if (file.size === 0) {
    return jsonResponse({ 
      success: false,
      error: 'File is empty' 
    }, 400);
  }

  // Generate unique filename
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const fileExtension = file.name.split('.').pop() || 'mp4';
  const fileName = `videos/${timestamp}-${randomString}.${fileExtension}`;

  console.log('⬆️ Uploading to R2:', fileName);

  try {
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('File buffer is empty');
    }
    
    const buffer = new Uint8Array(arrayBuffer);
    console.log('💾 Uploading buffer size:', buffer.length);

    // Upload to R2
    await env.VIDEO_BUCKET.put(fileName, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadTime: timestamp.toString(),
        size: file.size.toString(),
      },
    });

    console.log('✅ R2 upload successful');

    // Generate public URL
    const publicUrl = `https://pub-${env.VIDEO_BUCKET.accountId}.r2.dev/${fileName}`;

    return jsonResponse({
      success: true,
      message: 'Video uploaded successfully!',
      url: publicUrl,
      fileName: fileName,
      fileSize: file.size,
      contentType: file.type,
      timestamp: timestamp
    });

  } catch (r2Error) {
    console.error('❌ R2 Upload Error:', r2Error);
    return jsonResponse({ 
      success: false,
      error: 'Failed to upload video to storage',
      details: r2Error.message 
    }, 500);
  }
}

async function handleListVideos(env) {
  try {
    if (!env.VIDEO_BUCKET) {
      return jsonResponse({
        success: false,
        error: 'R2 bucket not available'
      }, 500);
    }

    const objects = await env.VIDEO_BUCKET.list();
    const videos = objects.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      url: `https://pub-${env.VIDEO_BUCKET.accountId}.r2.dev/${obj.key}`
    }));

    return jsonResponse({
      success: true,
      videos: videos,
      total: videos.length
    });
  } catch (error) {
    console.error('List videos error:', error);
    return jsonResponse({ 
      success: false,
      error: 'Failed to list videos',
      details: error.message
    }, 500);
  }
}

function handleHealthCheck() {
  return jsonResponse({
    success: true,
    status: 'OK',
    message: 'Cloudflare Video Uploader API is running',
    timestamp: new Date().toISOString(),
    platform: 'Cloudflare Workers + R2'
  });
}

function handleConfig(env) {
  return jsonResponse({
    success: true,
    maxFileSize: '100MB',
    allowedTypes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    features: ['Cloudflare R2 Storage', 'Adsterra Integration', 'Workers API'],
    adsterraLink: env.ADSTERRA_LINK || 'https://www.adsterra.com',
    r2Configured: !!env.VIDEO_BUCKET
  });
}

function jsonResponse(data, status = 200) {
  console.log('📤 Sending JSON response:', { status, data });
  
  const jsonString = JSON.stringify(data, null, 2);
  
  return new Response(jsonString, {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, *',
    },
  });
}