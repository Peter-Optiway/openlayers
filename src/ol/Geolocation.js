/**
 * @module ol/Geolocation
 */
import GeolocationProperty from './GeolocationProperty.js';
import BaseObject, {getChangeEventType} from './Object.js';
import {listen} from './events.js';
import EventType from './events/EventType.js';
import {circular as circularPolygon} from './geom/Polygon.js';
import {GEOLOCATION} from './has.js';
import {toRadians} from './math.js';
import {get as getProjection, getTransformFromProjections, identityTransform} from './proj.js';


/**
 * @typedef {Object} Options
 * @property {boolean} [tracking=false] Start Tracking right after
 * instantiation.
 * @property {PositionOptions} [trackingOptions] Tracking options.
 * See http://www.w3.org/TR/geolocation-API/#position_options_interface.
 * @property {module:ol/proj~ProjectionLike} [projection] The projection the position
 * is reported in.
 */


/**
 * @classdesc
 * Helper class for providing HTML5 Geolocation capabilities.
 * The [Geolocation API](http://www.w3.org/TR/geolocation-API/)
 * is used to locate a user's position.
 *
 * To get notified of position changes, register a listener for the generic
 * `change` event on your instance of {@link module:ol/Geolocation~Geolocation}.
 *
 * Example:
 *
 *     var geolocation = new Geolocation({
 *       // take the projection to use from the map's view
 *       projection: view.getProjection()
 *     });
 *     // listen to changes in position
 *     geolocation.on('change', function(evt) {
 *       window.console.log(geolocation.getPosition());
 *     });
 *
 * @fires error
 * @api
 */
class Geolocation extends BaseObject {

  /**
   * @param {module:ol/Geolocation~Options=} opt_options Options.
   */
  constructor(opt_options) {

    super();

    const options = opt_options || {};

    /**
     * The unprojected (EPSG:4326) device position.
     * @private
     * @type {module:ol/coordinate~Coordinate}
     */
    this.position_ = null;

    /**
     * @private
     * @type {module:ol/proj~TransformFunction}
     */
    this.transform_ = identityTransform;

    /**
     * @private
     * @type {number|undefined}
     */
    this.watchId_ = undefined;

    listen(
      this, getChangeEventType(GeolocationProperty.PROJECTION),
      this.handleProjectionChanged_, this);
    listen(
      this, getChangeEventType(GeolocationProperty.TRACKING),
      this.handleTrackingChanged_, this);

    if (options.projection !== undefined) {
      this.setProjection(options.projection);
    }
    if (options.trackingOptions !== undefined) {
      this.setTrackingOptions(options.trackingOptions);
    }

    this.setTracking(options.tracking !== undefined ? options.tracking : false);

  }

  /**
   * @inheritDoc
   */
  disposeInternal() {
    this.setTracking(false);
    super.disposeInternal();
  }

  /**
   * @private
   */
  handleProjectionChanged_() {
    const projection = this.getProjection();
    if (projection) {
      this.transform_ = getTransformFromProjections(
        getProjection('EPSG:4326'), projection);
      if (this.position_) {
        this.set(GeolocationProperty.POSITION, this.transform_(this.position_));
      }
    }
  }

  /**
   * @private
   */
  handleTrackingChanged_() {
    if (GEOLOCATION) {
      const tracking = this.getTracking();
      if (tracking && this.watchId_ === undefined) {
        this.watchId_ = navigator.geolocation.watchPosition(
          this.positionChange_.bind(this),
          this.positionError_.bind(this),
          this.getTrackingOptions());
      } else if (!tracking && this.watchId_ !== undefined) {
        navigator.geolocation.clearWatch(this.watchId_);
        this.watchId_ = undefined;
      }
    }
  }

  /**
   * @private
   * @param {Position} position position event.
   */
  positionChange_(position) {
    const coords = position.coords;
    this.set(GeolocationProperty.ACCURACY, coords.accuracy);
    this.set(GeolocationProperty.ALTITUDE,
      coords.altitude === null ? undefined : coords.altitude);
    this.set(GeolocationProperty.ALTITUDE_ACCURACY,
      coords.altitudeAccuracy === null ?
        undefined : coords.altitudeAccuracy);
    this.set(GeolocationProperty.HEADING, coords.heading === null ?
      undefined : toRadians(coords.heading));
    if (!this.position_) {
      this.position_ = [coords.longitude, coords.latitude];
    } else {
      this.position_[0] = coords.longitude;
      this.position_[1] = coords.latitude;
    }
    const projectedPosition = this.transform_(this.position_);
    this.set(GeolocationProperty.POSITION, projectedPosition);
    this.set(GeolocationProperty.SPEED,
      coords.speed === null ? undefined : coords.speed);
    const geometry = circularPolygon(this.position_, coords.accuracy);
    geometry.applyTransform(this.transform_);
    this.set(GeolocationProperty.ACCURACY_GEOMETRY, geometry);
    this.changed();
  }

  /**
   * Triggered when the Geolocation returns an error.
   * @event error
   * @api
   */

  /**
   * @private
   * @param {PositionError} error error object.
   */
  positionError_(error) {
    error.type = EventType.ERROR;
    this.setTracking(false);
    this.dispatchEvent(/** @type {{type: string, target: undefined}} */ (error));
  }

  /**
   * Get the accuracy of the position in meters.
   * @return {number|undefined} The accuracy of the position measurement in
   *     meters.
   * @observable
   * @api
   */
  getAccuracy() {
    return /** @type {number|undefined} */ (this.get(GeolocationProperty.ACCURACY));
  }

  /**
   * Get a geometry of the position accuracy.
   * @return {?module:ol/geom/Polygon} A geometry of the position accuracy.
   * @observable
   * @api
   */
  getAccuracyGeometry() {
    return (
      /** @type {?module:ol/geom/Polygon} */ (this.get(GeolocationProperty.ACCURACY_GEOMETRY) || null)
    );
  }

  /**
   * Get the altitude associated with the position.
   * @return {number|undefined} The altitude of the position in meters above mean
   *     sea level.
   * @observable
   * @api
   */
  getAltitude() {
    return /** @type {number|undefined} */ (this.get(GeolocationProperty.ALTITUDE));
  }

  /**
   * Get the altitude accuracy of the position.
   * @return {number|undefined} The accuracy of the altitude measurement in
   *     meters.
   * @observable
   * @api
   */
  getAltitudeAccuracy() {
    return /** @type {number|undefined} */ (this.get(GeolocationProperty.ALTITUDE_ACCURACY));
  }

  /**
   * Get the heading as radians clockwise from North.
   * Note: depending on the browser, the heading is only defined if the `enableHighAccuracy`
   * is set to `true` in the tracking options.
   * @return {number|undefined} The heading of the device in radians from north.
   * @observable
   * @api
   */
  getHeading() {
    return /** @type {number|undefined} */ (this.get(GeolocationProperty.HEADING));
  }

  /**
   * Get the position of the device.
   * @return {module:ol/coordinate~Coordinate|undefined} The current position of the device reported
   *     in the current projection.
   * @observable
   * @api
   */
  getPosition() {
    return (
      /** @type {module:ol/coordinate~Coordinate|undefined} */ (this.get(GeolocationProperty.POSITION))
    );
  }

  /**
   * Get the projection associated with the position.
   * @return {module:ol/proj/Projection|undefined} The projection the position is
   *     reported in.
   * @observable
   * @api
   */
  getProjection() {
    return (
      /** @type {module:ol/proj/Projection|undefined} */ (this.get(GeolocationProperty.PROJECTION))
    );
  }

  /**
   * Get the speed in meters per second.
   * @return {number|undefined} The instantaneous speed of the device in meters
   *     per second.
   * @observable
   * @api
   */
  getSpeed() {
    return /** @type {number|undefined} */ (this.get(GeolocationProperty.SPEED));
  }

  /**
   * Determine if the device location is being tracked.
   * @return {boolean} The device location is being tracked.
   * @observable
   * @api
   */
  getTracking() {
    return /** @type {boolean} */ (this.get(GeolocationProperty.TRACKING));
  }

  /**
   * Get the tracking options.
   * @see http://www.w3.org/TR/geolocation-API/#position-options
   * @return {PositionOptions|undefined} PositionOptions as defined by
   *     the [HTML5 Geolocation spec
   *     ](http://www.w3.org/TR/geolocation-API/#position_options_interface).
   * @observable
   * @api
   */
  getTrackingOptions() {
    return /** @type {PositionOptions|undefined} */ (this.get(GeolocationProperty.TRACKING_OPTIONS));
  }

  /**
   * Set the projection to use for transforming the coordinates.
   * @param {module:ol/proj~ProjectionLike} projection The projection the position is
   *     reported in.
   * @observable
   * @api
   */
  setProjection(projection) {
    this.set(GeolocationProperty.PROJECTION, getProjection(projection));
  }

  /**
   * Enable or disable tracking.
   * @param {boolean} tracking Enable tracking.
   * @observable
   * @api
   */
  setTracking(tracking) {
    this.set(GeolocationProperty.TRACKING, tracking);
  }

  /**
   * Set the tracking options.
   * @see http://www.w3.org/TR/geolocation-API/#position-options
   * @param {PositionOptions} options PositionOptions as defined by the
   *     [HTML5 Geolocation spec
   *     ](http://www.w3.org/TR/geolocation-API/#position_options_interface).
   * @observable
   * @api
   */
  setTrackingOptions(options) {
    this.set(GeolocationProperty.TRACKING_OPTIONS, options);
  }
}


export default Geolocation;
