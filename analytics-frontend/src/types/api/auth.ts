// Mirrors app/schemas/auth.py (Part 8 §8.4).

export interface RegisterRequest {
  email: string
  password: string
  fullName: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AccessTokenResponse {
  accessToken: string
  tokenType: "bearer"
  expiresIn: number
}

export interface AccountSummary {
  id: number
  email: string
  fullName: string
  emailVerified: boolean
}
