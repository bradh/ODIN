import L from 'leaflet'
import ms from 'milsymbol'
import { fromNow } from '../../shared/datetime'
import { K } from '../../shared/combinators'
import selection from '../components/App.selection'

const MODIFIER_MAP = {
  f: 'reinforcedReduced',
  m: 'higherFormation',
  q: 'direction',
  t: 'uniqueDesignation',
  z: 'speed'
}

const icon = symbol => L.divIcon({
  className: '',
  html: symbol.asSVG(),
  iconAnchor: new L.Point(symbol.getAnchor().x, symbol.getAnchor().y)
})

const modifiers = feature => Object.entries(feature.properties)
  .filter(([key, value]) => MODIFIER_MAP[key] && value)
  .map(([key, value]) => ([key, key === 'w' ? fromNow(value) : value]))
  .reduce((acc, [key, value]) => K(acc)(acc => (acc[MODIFIER_MAP[key]] = value)), {})

const symbolOptions = feature => ({
  standard: {
    size: 34,
    colorMode: 'Light', // default: light
    simpleStatusModifier: true,
    ...modifiers(feature)
  },
  highlighted: {
    size: 34,
    colorMode: 'Light', // default: light
    simpleStatusModifier: true,
    monoColor: 'white',
    outlineColor: 'black',
    outlineWidth: 6,
    ...modifiers(feature)
  }
})

const symbol = (feature, options) => {
  const sidc = feature.properties.sidc
  return new ms.Symbol(sidc, options)
}

const options = {
  draggable: false, // only draggable in edit mode
  autoPan: true,
  keyboard: false
}

const initialize = function (feature, options) {
  options = options || {}
  this.urn = feature.urn

  // Prepare standard and highlighted icons:
  this.prepareIcons(feature)
  L.Util.setOptions(this, options)

  // TODO: move to GeoJSON helper
  const latlng = L.latLng(
    feature.geometry.coordinates[1],
    feature.geometry.coordinates[0])

  L.Marker.prototype.initialize.call(this, latlng)
  this.setIcon(this.icons.standard)

  this.selected = urn => {
    if (this.urn !== urn) return
    this.dragging.enable()
    this.setIcon(this.icons.highlighted)
  }

  this.deselected = urn => {
    if (this.urn !== urn) return
    this.dragging.disable()
    this.setIcon(this.icons.standard)
  }
}

const prepareIcons = function (feature) {
  this.icons = {}

  Object.keys(symbolOptions(feature)).forEach(key => {
    this.icons[key] = icon(symbol(feature, symbolOptions(feature)[key]))
  })
}

const onAdd = function (map) {
  L.Marker.prototype.onAdd.call(this, map)
  this.on('click', this.edit, this)
  this.on('dragend', this.onDragend, this)
  selection.on('selected', this.selected)
  selection.on('deselected', this.deselected)
}

const onRemove = function (map) {
  selection.off('deselected', this.deselected)
  selection.off('selected', this.selected)
  this.off('dragend', this.onDragend, this)
  this.off('click', this.edit, this)
  L.Marker.prototype.onRemove.call(this, map)
}

const edit = function () {
  if (selection.isSelected(this.urn)) return
  selection.select(this.urn)

  const editor = {
    dispose: () => {
      if (selection.isSelected(this.urn)) {
        selection.deselect()
      }
    }
  }

  this._map.tools.edit(editor)
}

const onDragend = function () {
  this.feature.updateGeometry(this.geometry())
}

const updateData = function (feature) {
  // TODO: move to GeoJSON helper
  const latlng = L.latLng(
    feature.geometry.coordinates[1],
    feature.geometry.coordinates[0])

  this.setLatLng(latlng)

  if (this.feature.properties.sidc !== feature.properties.sidc) {
    this.prepareIcons(feature)
    const selected = selection.isSelected(this.urn)
    this.setIcon(selected ? this.icons.highlighted : this.icons.standard)
  }
}

const geometry = function () {
  const { lat, lng } = this.getLatLng()
  return { type: 'Point', coordinates: [lng, lat] }
}

L.Feature.Symbol = L.Marker.extend({
  options,
  initialize,
  prepareIcons,
  onAdd,
  onRemove,
  edit,
  onDragend,
  geometry,
  updateData
})
