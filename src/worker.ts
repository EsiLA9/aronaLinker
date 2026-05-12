type AssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export interface Env {
  ASSETS: AssetFetcher;
}

function withIndexHtml(url: URL): URL {
  const nextUrl = new URL(url);

  if (nextUrl.pathname.endsWith("/")) {
    nextUrl.pathname += "index.html";
    return nextUrl;
  }

  const lastSegment = nextUrl.pathname.split("/").pop() ?? "";
  if (!lastSegment.includes(".")) {
    nextUrl.pathname += "/index.html";
  }

  return nextUrl;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) {
      return response;
    }

    const fallbackUrl = withIndexHtml(new URL(request.url));
    if (fallbackUrl.toString() === request.url) {
      return response;
    }

    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  },
};

export default worker;
