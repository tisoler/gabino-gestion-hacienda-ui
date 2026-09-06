import api from './api'
import type { AxiosError } from 'axios'

/**
 * Al registrarse, le pedimos al BE que cree el documento `usuarios/{uid}` en
 * Firestore si no existe (igual que gabino-agrogestion): la identidad se crea
 * server-side con el Firebase Admin SDK (bypassa las reglas del cliente).
 *
 * El documento queda SIN rol (el BE lo crea con `idRol: null`, pendiente de
 * que sys-admin asigne anfitrión/cliente/operario). El nombre lo resuelve el
 * BE desde Firebase Auth (displayName/email); acá sólo se manda el celular.
 *
 * Best-effort con reintentos: justo después de crear la cuenta, el ID token
 * recién emitido puede fallar al verificarse por un instante (propagación) o
 * la red puede fallar. Reintentamos los errores transitorios (sin token / 401
 * / 5xx / 429) antes de rendirnos; los 4xx deterministas no se reintentan.
 */
export async function asegurarUsuarioFirestore(celular?: string): Promise<void> {
  const INTENTOS = 3
  const payload = celular ? { celular } : {}
  for (let i = 1; i <= INTENTOS; i++) {
    try {
      await api.post('/usuarios/bootstrap', payload)
      return
    } catch (err) {
      const status = (err as AxiosError)?.response?.status
      const transitorio = status === undefined || status === 401 || status === 429 || status >= 500
      if (transitorio && i < INTENTOS) {
        await new Promise((r) => setTimeout(r, 500 * i))
        continue
      }
      console.warn('[signup] No se pudo crear el documento del usuario en Firestore:', err)
      return
    }
  }
}