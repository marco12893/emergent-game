const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const DAMAGE_ANIMATION_DURATION = 700
export const DEATH_ANIMATION_DURATION = 900

export const getDamageAnimationFrame = ({ now, createdAt, duration = DAMAGE_ANIMATION_DURATION }) => {
  const elapsed = now - createdAt
  if (elapsed < 0 || elapsed > duration) {
    return { active: false }
  }

  const progress = clamp(elapsed / duration, 0, 1)
  const intensity = Math.pow(1 - progress, 0.7)
  const shake = Math.sin(progress * Math.PI * 5) * intensity * 0.55

  return {
    active: true,
    progress,
    intensity,
    shakeX: shake,
    flashOpacity: 0.62 * intensity,
    scale: 1 + (0.025 * intensity),
  }
}

export const getDeathAnimationFrame = ({ now, createdAt, duration = DEATH_ANIMATION_DURATION }) => {
  const elapsed = now - createdAt
  if (elapsed < 0 || elapsed > duration) {
    return { active: false }
  }

  const progress = clamp(elapsed / duration, 0, 1)
  const opacity = 1 - progress

  return {
    active: true,
    progress,
    opacity,
    ringRadius: 3.5 + (progress * 5.5),
    ringStrokeWidth: 0.65 * opacity,
    iconScale: 0.88 + (progress * 0.32),
    yOffset: -(progress * 1.4),
  }
}
