import Filter from 'bad-words'

const filter = new Filter()

// Additional custom words to block
filter.addWords(
  'admin', 'moderator', 'staff', 'rotate4', 'rotate_4',
  'support', 'official', 'superuser', 'root', 'system'
)

/**
 * Returns true if the username is clean (no profanity or reserved words).
 */
export function isUsernameClean(username: string): boolean {
  try {
    return !filter.isProfane(username)
  } catch {
    return false
  }
}

/**
 * Validate a username's format and content.
 * Returns an error message string, or null if valid.
 */
export function validateUsername(username: string): string | null {
  const trimmed = username.trim()

  if (trimmed.length < 3) return 'Username must be at least 3 characters.'
  if (trimmed.length > 20) return 'Username must be 20 characters or fewer.'
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return 'Username can only contain letters, numbers, and underscores.'
  }
  if (!/^[a-zA-Z]/.test(trimmed)) {
    return 'Username must start with a letter.'
  }
  if (!isUsernameClean(trimmed)) {
    return 'That username is not allowed. Please choose a different one.'
  }

  return null
}
