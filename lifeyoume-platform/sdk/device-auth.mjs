const DEFAULT_AUTH_ORIGIN = "https://auth.lifeyoume.icu";

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || `Identity request failed: ${response.status}`);
    error.code = payload.error || "identity_error";
    throw error;
  }
  return payload;
}

export async function startDeviceAuthorization(
  clientId,
  authOrigin = DEFAULT_AUTH_ORIGIN,
) {
  return requestJson(`${authOrigin}/api/v1/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });
}

export async function exchangeDeviceCode(
  deviceCode,
  authOrigin = DEFAULT_AUTH_ORIGIN,
) {
  return requestJson(`${authOrigin}/api/v1/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });
}

export async function loadLifeYouMeAccount(
  accessToken,
  authOrigin = DEFAULT_AUTH_ORIGIN,
) {
  return requestJson(`${authOrigin}/api/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
