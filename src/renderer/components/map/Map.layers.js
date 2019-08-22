import L from 'leaflet'
import uuid from 'uuid-random'
import evented from '../../evented'
import store from '../../stores/layer-store'

const createFeature = (map, layerId) => ([featureId, feature]) => ({
  featureId,
  ...feature,
  'delete': () => store.deleteFeature(layerId)(featureId),
  copy: () => ({ type: feature.type, geometry: feature.geometry, properties: feature.properties }),
  paste: object => {
    // Only default layer (layerId: 0) can receive new features.
    store.addFeature(0)(uuid(), ({
      type: object.type,
      geometry: object.geometry,
      properties: object.properties
    }))
  },
  updateGeometry: geometry => store.updateFeature(layerId)(featureId, { ...feature, geometry })
})

evented.on('MAP_CREATED', map => {
  const layers = {}

  const handlers = {
    'layer-added': ({ layerId }) => {
      layers[layerId] = new L.Feature.Layer([]).addTo(map)
    },

    'layer-deleted': ({ layerId }) => {
      map.removeLayer(layers[layerId])
      delete layers[layerId]
    },

    'layer-shown': ({ layerId }) => layers[layerId].addTo(map),
    'layer-hidden': ({ layerId }) => map.removeLayer(layers[layerId]),

    'feature-added': ({ layerId, featureId, feature }) => {
      if (!layers[layerId]) return
      layers[layerId].addData(createFeature(map, layerId)([featureId, feature]))
    },

    'feature-updated': ({ layerId, featureId, feature }) => {
      if (!layers[layerId]) return
      layers[layerId].eachLayer(featureLayer => {
        if (featureLayer.feature.featureId !== featureId) return
        layers[layerId].feature = feature
      })
    },

    'feature-deleted': ({ layerId, featureId }) => {
      if (!layers[layerId]) return
      layers[layerId].eachLayer(featureLayer => {
        if (featureLayer.feature.featureId !== featureId) return
        layers[layerId].removeLayer(featureLayer)
      })
    }
  }

  const createLayers = state => {
    Object.entries(state).forEach(([layerId, layer]) => {
      const feature = createFeature(map, layerId)
      const features = Object.entries(layer.features).map(feature)
      layers[layerId] = new L.Feature.Layer(features)
      if (layer.show) layers[layerId].addTo(map)
    })
  }

  store.on('event', event => (handlers[event.type] || (() => {}))(event))

  if (store.ready()) createLayers(store.state())
  else store.on('ready', createLayers)
})