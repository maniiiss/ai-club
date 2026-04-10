import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/auth'
import { changePasswordApi, getCurrentUser, loginApi, logoutApi, registerApi, updateProfileApi, uploadProfileAvatarApi } from '@/api/auth'
import type { CurrentUserInfo } from '@/types/platform'

const readCachedUser = (): CurrentUserInfo | null => {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as CurrentUserInfo
  } catch {
    localStorage.removeItem(AUTH_USER_KEY)
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(AUTH_TOKEN_KEY) || '')
  const user = ref<CurrentUserInfo | null>(readCachedUser())
  const profileLoaded = ref(false)

  const isLoggedIn = computed(() => Boolean(token.value))
  const permissionCodes = computed(() => user.value?.permissionCodes || [])

  const setSession = (nextToken: string, nextUser: CurrentUserInfo) => {
    token.value = nextToken
    user.value = nextUser
    profileLoaded.value = true
    localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser))
  }

  const clearSession = () => {
    token.value = ''
    user.value = null
    profileLoaded.value = false
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
  }

  const login = async (username: string, password: string) => {
    const result = await loginApi({ username, password })
    setSession(result.token, result.user)
    return result
  }

  const fetchProfile = async () => {
    if (!token.value) {
      clearSession()
      return null
    }
    const profile = await getCurrentUser()
    user.value = profile
    profileLoaded.value = true
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile))
    return profile
  }

  const restoreSession = async () => {
    if (!token.value) {
      clearSession()
      return null
    }
    if (profileLoaded.value && user.value) {
      return user.value
    }
    try {
      return await fetchProfile()
    } catch {
      clearSession()
      return null
    }
  }

  const logout = async () => {
    try {
      if (token.value) {
        await logoutApi()
      }
    } finally {
      clearSession()
    }
  }

  const register = async (payload: {
    username: string
    nickname: string
    email: string
    phone: string
    gitlabUsername: string
    password: string
  }) => {
    await registerApi(payload)
  }

  const updateProfile = async (payload: {
    nickname: string
    email: string
    phone: string
    gitlabUsername: string
  }) => {
    const profile = await updateProfileApi(payload)
    user.value = profile
    profileLoaded.value = true
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile))
    return profile
  }

  const uploadAvatar = async (file: File) => {
    const profile = await uploadProfileAvatarApi(file)
    user.value = profile
    profileLoaded.value = true
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile))
    return profile
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await changePasswordApi({ currentPassword, newPassword })
  }

  const hasPermission = (permission?: string | string[]) => {
    if (!permission) {
      return true
    }
    const current = new Set(permissionCodes.value)
    if (Array.isArray(permission)) {
      return permission.some((item) => current.has(item))
    }
    return current.has(permission)
  }

  return {
    token,
    user,
    isLoggedIn,
    profileLoaded,
    permissionCodes,
    login,
    register,
    logout,
    updateProfile,
    uploadAvatar,
    changePassword,
    restoreSession,
    fetchProfile,
    hasPermission,
    clearSession
  }
})
