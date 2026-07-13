export class DemoApiClient {
  constructor({ baseUrl, fetchImpl = fetch } = {}) {
    if (!baseUrl) {
      throw new Error('DemoApiClient requires baseUrl');
    }

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async login({ email, password }) {
    return this.request('/auth/login', {
      body: { email, password },
      method: 'POST',
    });
  }

  async federationSync(payload, accessToken) {
    return this.request('/federation-sync', {
      accessToken,
      body: payload,
      method: 'POST',
    });
  }

  async request(path, { accessToken, body, method = 'GET' } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
      },
      method,
    });

    const responseText = await response.text();
    const responseBody = responseText.length === 0 ? null : JSON.parse(responseText);

    if (!response.ok) {
      const message = responseBody?.message ?? responseBody?.error ?? response.statusText;
      throw new Error(`API ${method} ${path} failed with ${response.status}: ${message}`);
    }

    return responseBody;
  }
}
