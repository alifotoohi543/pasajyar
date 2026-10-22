import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'

export type Pin = { id: string; lat: number; lon: number; label: string; kind?: 'best' | 'maybe' | 'normal' }

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const icon = (label: string, cls: string) =>
  L.divIcon({ className: `pin ${cls}`, html: `<div>${esc(label)}</div>`, iconSize: [0, 0] })

function Fit({ pins, me }: { pins: Pin[]; me: { lat: number; lon: number } }) {
  const map = useMap()
  const key = pins.map(p => p.id).join(',') + `|${me.lat},${me.lon}`
  useEffect(() => {
    const pts = [...pins.map(p => [p.lat, p.lon] as [number, number]), [me.lat, me.lon] as [number, number]]
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 })
    else map.setView(pts[0], 15)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

export default function MapView({ pins, me, onPick, className = 'h-80' }: {
  pins: Pin[]; me: { lat: number; lon: number }; onPick?: (id: string) => void; className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-2xl ring-1 ring-line ${className}`}>
      <MapContainer center={[me.lat, me.lon]} zoom={14} className="h-full w-full" scrollWheelZoom={false} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        <Marker position={[me.lat, me.lon]} icon={icon('شما', 'me')} />
        {pins.map(p => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={icon(p.label, p.kind || 'normal')}
            eventHandlers={{ click: () => onPick?.(p.id) }} />
        ))}
        <Fit pins={pins} me={me} />
      </MapContainer>
    </div>
  )
}
