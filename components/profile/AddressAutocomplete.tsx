'use client'

import { useEffect, useRef, useState } from 'react'

type StructuredAddress = {
  raw: string
  street: string
  city: string
  state: string
  zip: string
  country: string
}

type Props = {
  value: string
  onChange: (display: string, structured: StructuredAddress | null) => void
  inputClass?: string
}

declare global {
  interface Window {
    google: typeof google
    initGooglePlaces?: () => void
  }
}

function parsePlace(place: google.maps.places.PlaceResult): StructuredAddress {
  const get = (type: string) =>
    place.address_components?.find((c) => c.types.includes(type))?.long_name ?? ''
  const getShort = (type: string) =>
    place.address_components?.find((c) => c.types.includes(type))?.short_name ?? ''

  const streetNumber = get('street_number')
  const route = get('route')
  const street = [streetNumber, route].filter(Boolean).join(' ')
  const city = get('locality') || get('sublocality') || get('postal_town')
  const state = getShort('administrative_area_level_1')
  const zip = get('postal_code')
  const country = get('country')
  const raw = place.formatted_address ?? street

  return { raw, street, city, state, zip, country }
}

let scriptLoaded = false
let scriptLoading = false
const callbacks: (() => void)[] = []

function loadGooglePlaces(apiKey: string, onReady: () => void) {
  if (scriptLoaded) { onReady(); return }
  callbacks.push(onReady)
  if (scriptLoading) return
  scriptLoading = true
  window.initGooglePlaces = () => {
    scriptLoaded = true
    callbacks.forEach(cb => cb())
    callbacks.length = 0
  }
  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`
  script.async = true
  script.defer = true
  document.head.appendChild(script)
}

export default function AddressAutocomplete({ value, onChange, inputClass = '' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [ready, setReady] = useState(false)
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY ?? ''

  useEffect(() => {
    if (!apiKey) return
    loadGooglePlaces(apiKey, () => setReady(true))
  }, [apiKey])

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: ['us', 'ca', 'gb', 'au'] },
      fields: ['formatted_address', 'address_components'],
    })
    autocompleteRef.current = ac
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (!place.address_components) return
      const structured = parsePlace(place)
      onChange(structured.raw, structured)
    })
  }, [ready, onChange])

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      onChange={e => onChange(e.target.value, null)}
      placeholder="Start typing your address…"
      className={inputClass}
      autoComplete="off"
    />
  )
}
