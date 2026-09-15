import { useAuth } from '../contexts/auth-context'
import { Building2, Users, MapPin, Fence, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getRoleLabel } from '../constantes'
import GabinoLogo from '../components/GabinoLogo'

export default function Dashboard() {
  const { user, permisos, currentEmpresa, isAnfitrion, isSysAdmin, isCliente } = useAuth()
  const roleLabel = getRoleLabel(user?.roles)
  // Saludo: el nombre de Firestore si existe; si no, el mail sin dominio.
  const nombre = user?.nombre ?? user?.nombreUsuario?.split('@')[0]

  const hasEmpresa = !!currentEmpresa || isSysAdmin
  const pending = !isSysAdmin && (user?.roles?.length ?? 0) === 0

  // El CLIENTE sólo ve Lotes (lectura). El resto se gatea por permiso, igual
  // que el Sidebar (para el cliente, corrales queda oculto aunque tenga el
  // permiso del mapa).
  const cards = [
    {
      to: '/mi-empresa',
      title: 'Mi Empresa',
      description: 'Datos de tu empresa: nombre, dirección y teléfono.',
      icon: Building2,
      show: !isCliente && (hasEmpresa || isAnfitrion),
    },
    {
      to: '/clientes',
      title: 'Clientes',
      description: 'Vinculá clientes y operarios a tu empresa.',
      icon: Users,
      show: !isCliente && (isAnfitrion || isSysAdmin),
    },
    {
      to: '/lotes',
      title: 'Lotes',
      description: 'Partidas de animales y su mapa de corrales.',
      icon: MapPin,
      show: permisos.includes('lectura:lote'),
    },
    {
      to: '/corrales',
      title: 'Corrales',
      description: 'Comunes y de enfermería: alta, edición y estado.',
      icon: Fence,
      show: !isCliente && permisos.includes('lectura:corral'),
    },
  ].filter((c) => c.show)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {nombre
            ? `Bienvenido, ${nombre}. `
            : roleLabel
              ? `Bienvenido, ${roleLabel}. `
              : ''}
          Gestión de hacienda Gabino.
        </p>
      </div>

      {pending && (
        <div className="premium-card p-6">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-md bg-primary-soft flex items-center justify-center shrink-0">
              <GabinoLogo className="size-14 text-primary" grosor={10} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">Cuenta pendiente de habilitación</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tu cuenta aún no tiene un rol asignado. Un administrador debe habilitarte
                como anfitrión, cliente u operario para que puedas usar la plataforma.
              </p>
            </div>
          </div>
        </div>
      )}

      {isAnfitrion && !hasEmpresa && (
        <div className="premium-card p-6">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-md bg-primary-soft flex items-center justify-center shrink-0">
              <GabinoLogo className="size-14 text-primary" grosor={10} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">Creá tu empresa</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Sos anfitrión. Creá tu empresa para empezar a hospedar lotes de clientes.
              </p>
              <Link
                to="/mi-empresa"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Ir a Mi Empresa <ArrowRight className="size-3.5" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="premium-card p-5 hover:border-primary/40 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Icon className="size-5" strokeWidth={1.75} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}