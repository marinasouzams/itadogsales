import { useParams } from 'react-router-dom'
import RepLayout from '@/layouts/RepLayout'
import ProspectProfile from '@/components/shared/ProspectProfile'

export default function ProspectPerfil() {
  const { id } = useParams<{ id: string }>()
  return (
    <RepLayout title="Prospect">
      <ProspectProfile
        prospectId={id ?? ''}
        backTo="/rep/crm"
        clientDetailPath={clientId => `/rep/clientes/${clientId}`}
      />
    </RepLayout>
  )
}
