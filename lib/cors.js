export const getAllowedOrigin = (request, configuredOrigins = process.env.CORS_ORIGINS || '*') => {
  const allowedOrigins = String(configuredOrigins)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (allowedOrigins.includes('*')) {
    return '*'
  }

  const requestOrigin = request?.headers?.get('origin') || null
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin
  }

  return null
}
