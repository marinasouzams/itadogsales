import { useParams } from 'react-router-dom'
import AdminLayout from '@/layouts/AdminLayout'
import ProspectProfile from '@/components/shared/ProspectProfile'

export default function ProspectDetalhes() {
  const { id } = useParams<{ id: string }>()
  return (
    <AdminLayout title="Prospect">
      <ProspectProfile
        prospectId={id ?? ''}
        backTo="/admin/crm"
        clientDetailPath={clientId => `/admin/clientes/${clientId}`}
      />
    </AdminLayout>
  )
}
