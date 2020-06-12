/* eslint-disable camelcase */
/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
/* eslint-disable no-mixed-operators */
/* eslint-disable no-unused-vars */
/* eslint-disable prefer-const */

import { Modify } from 'ol/interaction'
import GeometryType from 'ol/geom/GeometryType'
import {
  squaredDistance as squaredCoordinateDistance,
  squaredDistanceToSegment,
  closestOnSegment,
  distance as coordinateDistance
} from 'ol/coordinate'
import { fromUserExtent, toUserExtent, fromUserCoordinate, toUserCoordinate } from 'ol/proj'
import { createOrUpdateFromCoordinate as createExtent, buffer as bufferExtent } from 'ol/extent'

/**
 * The segment index assigned to a circle's circumference when
 * breaking up a circle into ModifySegmentDataType segments.
 * @type {number}
 */
const CIRCLE_CIRCUMFERENCE_INDEX = 1;

const tempExtent = [0, 0, 0, 0];
const tempSegment = [];

/**
 * Returns the distance from a point to a line segment.
 *
 * @param {import("../coordinate.js").Coordinate} pointCoordinates The coordinates of the point from
 *        which to calculate the distance.
 * @param {SegmentData} segmentData The object describing the line
 *        segment we are calculating the distance to.
 * @param {import("../proj/Projection.js").default} projection The view projection.
 * @return {number} The square of the distance between a point and a line segment.
 */
function projectedDistanceToSegmentDataSquared(pointCoordinates, segmentData, projection) {
  const geometry = segmentData.geometry;

  if (geometry.getType() === GeometryType.CIRCLE) {
    const circleGeometry = /** @type {import("../geom/Circle.js").default} */ (geometry);

    if (segmentData.index === CIRCLE_CIRCUMFERENCE_INDEX) {
      const distanceToCenterSquared =
            squaredCoordinateDistance(circleGeometry.getCenter(), pointCoordinates);
      const distanceToCircumference =
            Math.sqrt(distanceToCenterSquared) - circleGeometry.getRadius();
      return distanceToCircumference * distanceToCircumference;
    }
  }

  const coordinate = fromUserCoordinate(pointCoordinates, projection);
  tempSegment[0] = fromUserCoordinate(segmentData.segment[0], projection);
  tempSegment[1] = fromUserCoordinate(segmentData.segment[1], projection);
  return squaredDistanceToSegment(coordinate, tempSegment);
}

/**
 * Returns the point closest to a given line segment.
 *
 * @param {import("../coordinate.js").Coordinate} pointCoordinates The point to which a closest point
 *        should be found.
 * @param {SegmentData} segmentData The object describing the line
 *        segment which should contain the closest point.
 * @param {import("../proj/Projection.js").default} projection The view projection.
 * @return {import("../coordinate.js").Coordinate} The point closest to the specified line segment.
 */
function closestOnSegmentData(pointCoordinates, segmentData, projection) {
  const geometry = segmentData.geometry;

  if (geometry.getType() === GeometryType.CIRCLE && segmentData.index === CIRCLE_CIRCUMFERENCE_INDEX) {
    return geometry.getClosestPoint(pointCoordinates);
  }
  const coordinate = fromUserCoordinate(pointCoordinates, projection);
  tempSegment[0] = fromUserCoordinate(segmentData.segment[0], projection);
  tempSegment[1] = fromUserCoordinate(segmentData.segment[1], projection);
  return toUserCoordinate(closestOnSegment(coordinate, tempSegment), projection);
}


export class CustomModify extends Modify {

  handlePointerAtPixel_ (pixel, map, opt_coordinate) {
    const pixelCoordinate = opt_coordinate || map.getCoordinateFromPixel(pixel);
    const projection = map.getView().getProjection();
    const sortByDistance = function(a, b) {
      return projectedDistanceToSegmentDataSquared(pixelCoordinate, a, projection) -
          projectedDistanceToSegmentDataSquared(pixelCoordinate, b, projection);
    };

    const viewExtent = fromUserExtent(createExtent(pixelCoordinate, tempExtent), projection);
    const buffer = map.getView().getResolution() * this.pixelTolerance_;
    const box = toUserExtent(bufferExtent(viewExtent, buffer, tempExtent), projection);

    const rBush = this.rBush_;
    const nodes = rBush.getInExtent(box);
    let removeVertexFeature = true

    if (nodes.length > 0) {
      nodes.sort(sortByDistance);
      const node = nodes[0];
      const closestSegment = node.segment;
      let vertex = closestOnSegmentData(pixelCoordinate, node, projection);
      const vertexPixel = map.getPixelFromCoordinate(vertex);
      let dist = coordinateDistance(pixel, vertexPixel);

      if (dist <= this.pixelTolerance_) {
        /** @type {Object<string, boolean>} */

        if (node.geometry.getType() === GeometryType.CIRCLE && node.index === CIRCLE_CIRCUMFERENCE_INDEX) {
          this.snappedToVertex_ = true;
          this.createOrUpdateVertexFeature_(vertex);
        } else {
          const pixel1 = map.getPixelFromCoordinate(closestSegment[0]);
          const pixel2 = map.getPixelFromCoordinate(closestSegment[1]);
          const squaredDist1 = squaredCoordinateDistance(vertexPixel, pixel1);
          const squaredDist2 = squaredCoordinateDistance(vertexPixel, pixel2);
          dist = Math.sqrt(Math.min(squaredDist1, squaredDist2));
          this.snappedToVertex_ = dist <= this.pixelTolerance_;

          if (this.snappedToVertex_) {
            vertex = squaredDist1 > squaredDist2 ? closestSegment[1] : closestSegment[0];
            this.createOrUpdateVertexFeature_(vertex);
            removeVertexFeature = false
          }
        }
      }
    }

    if (removeVertexFeature && this.vertexFeature_) {
      this.overlay_.getSource().removeFeature(this.vertexFeature_);
      this.vertexFeature_ = null;
    }
  }
}
