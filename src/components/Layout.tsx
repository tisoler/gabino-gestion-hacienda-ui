import { Sidebar } from './Sidebar'
import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useAuth } from '../contexts/auth-context'

export default function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { currentEmpresa, isSysAdmin } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main
        className={`transition-[padding] duration-200 ease-out pl-0 ${isCollapsed ? 'lg:pl-16' : 'lg:pl-52'
          }`}
      >
        {/* El ancho es relativo al área de contenido (ya descuenta el sidebar
            con el padding-left de <main>). Se usa ~95% centrado en lugar del
            tope fijo max-w-7xl (1280px): en laptops el ancho es el mismo que
            antes, pero en monitores grandes se recuperan ~400px que se
            perdían en márgenes, dejando las tablas más holgadas y evitando
            el scroll horizontal. Tope alto para pantallas ultra-anchas. */}
        <div className="w-[95%] max-w-[1800px] mx-auto p-4 md:p-6 pt-16 md:pt-4 min-h-screen">
          <div className="print-hide flex justify-end items-center gap-2 mb-7">
            {currentEmpresa && !isSysAdmin && (
              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-soft text-primary text-xs font-semibold rounded-full">
                <Building2 className="size-3.5" strokeWidth={2} />
                {currentEmpresa}
              </span>
            )}
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}