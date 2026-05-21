import { NextResponse } from 'next/server';

// Simple HTML entity decoder
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Normalize URL
  targetUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse title using regex
    const titleRegex = /<title[^>]*>([\s\S]*?)<\/title>/i;
    const match = html.match(titleRegex);

    if (match && match[1]) {
      const cleanTitle = decodeHtmlEntities(match[1].trim())
        .replace(/\s+/g, ' ') // clean up whitespace
        .substring(0, 100); // limit length
      return NextResponse.json({ title: cleanTitle });
    }

    // Fallback if no title found
    const hostname = new URL(targetUrl).hostname.replace('www.', '');
    const fallbackTitle = hostname.charAt(0).toUpperCase() + hostname.slice(1);
    return NextResponse.json({ title: fallbackTitle });
  } catch (error: any) {
    console.error('Error fetching title for:', targetUrl, error?.message || error);
    try {
      const hostname = new URL(targetUrl).hostname.replace('www.', '');
      const fallbackTitle = hostname.charAt(0).toUpperCase() + hostname.slice(1);
      return NextResponse.json({ title: fallbackTitle });
    } catch {
      return NextResponse.json({ title: 'Untitled Bookmark' });
    }
  }
}
