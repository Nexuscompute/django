GeometryTypeControl = function(opt_options) {
    // Map control to switch type when geometry type is unknown
    var options = opt_options || {};

    var element = document.createElement('div');
    element.className = 'switch-type type-' + options.type + ' ol-control ol-unselectable';
    if (options.active) element.className += " type-active";

    var self = this;
    var switchType = function(e) {
        e.preventDefault();
        if (options.widget.currentGeometryType != self) {
            options.widget.map.removeInteraction(options.widget.interactions.draw);
            options.widget.interactions.draw = new ol.interaction.Draw({
                features: options.widget.featureOverlay.getFeatures(),
                type: options.type
            });
            options.widget.map.addInteraction(options.widget.interactions.draw);
            options.widget.currentGeometryType.element.className = options.widget.currentGeometryType.element.className.replace(/ type-active/g, '');
            options.widget.currentGeometryType = self;
            element.className += " type-active";
        }
    };

    element.addEventListener('click', switchType, false);
    element.addEventListener('touchstart', switchType, false);

    ol.control.Control.call(this, {
        element: element
    });
};
ol.inherits(GeometryTypeControl, ol.control.Control);

// TODO: allow deleting individual features
(function() {
jsonFormat = new ol.format.GeoJSON();

function MapWidget(options) {
    this.map = null;
    this.base_layer = null;
    this.interactions = {draw: null, modify: null};
    this.typeChoices = false;
    this.ready = false;

    // Default options
    this.options = {
        default_lat: 0,
        default_lon: 0,
        default_zoom: 4,
        isCollection: options['geom_name'].indexOf('Multi') >= 0 || options['geom_name'].indexOf('Collection') >= 0
    }

    // Altering using user-provided options
    for (var property in options) {
        if (options.hasOwnProperty(property)) {
            this.options[property] = options[property];
        }
    }

    this.featureOverlay = new ol.FeatureOverlay();
    this.map = this.createMap();

    // Populate and set handlers for the feature container
    var self = this;
    this.featureOverlay.getFeatures().on('add', function(event) {
        var feature = event.element;
        feature.on('change', function(event) {
            self.serializeFeatures();
        });
        if (self.ready) {
            self.serializeFeatures();
            if (!self.options.isCollection)
                self.disableDrawing(); // Only allow one feature at a time
        }
    })
    this.featureOverlay.setMap(this.map);

    var initial_value = document.getElementById(this.options.id).value;
    if (initial_value) {
        var features = jsonFormat.readFeatures('{"type": "Feature", "geometry": ' + initial_value + '}');
        var extent = ol.extent.createEmpty();
        features.forEach(function(feature) {
            this.featureOverlay.addFeature(feature);
            ol.extent.extend(extent, feature.getGeometry().getExtent());
        }, this);
        // Centering/zooming the map
        this.map.getView().fitExtent(extent, this.map.getSize());
    } else {
        this.map.getView().setCenter(this.defaultCenter());
    }
    this.createInteractions();
    if (initial_value && !this.options.isCollection) this.disableDrawing();
    this.ready = true;
}

MapWidget.prototype.createMap = function() {
    if (this.options.base_layer) this.base_layer = this.options.base_layer;
    else {
        this.base_layer = new ol.layer.Tile({
            title: "OpenLayers WMS",
            source: new ol.source.TileWMS({
                url: 'http://demo.opengeo.org/geoserver/wms',
                //url: 'http://maps.opengeo.org/geowebcache/service/wms',
                params: {LAYERS: 'nasa:bluemarble', TILED: true}
            })
        });
    }

    var map = new ol.Map({
        target: this.options.map_id,
        layers: [this.base_layer],
        view: new ol.View({
            zoom: this.options.default_zoom
        })
    });
    return map;
};

MapWidget.prototype.createInteractions = function() {
    // Initialize the modify interaction
    this.interactions.modify = new ol.interaction.Modify({
        features: this.featureOverlay.getFeatures(),
        deleteCondition: function(event) {
            return ol.events.condition.shiftKeyOnly(event) &&
                ol.events.condition.singleClick(event);
        }
    });

    // Initialize the draw interaction
    var geomType = this.options.geom_name;
    if (geomType == "Unknown" || geomType == "GeometryCollection") {
        // Default to Point, but create icons to switch type
        geomType = "Point";
        this.currentGeometryType = new GeometryTypeControl({widget: this, type: "Point", active: true});
        this.map.addControl(this.currentGeometryType);
        this.map.addControl(new GeometryTypeControl({widget: this, type: "LineString", active: false}));
        this.map.addControl(new GeometryTypeControl({widget: this, type: "Polygon", active: false}));
        this.typeChoices = true;
    }
    this.interactions.draw = new ol.interaction.Draw({
        features: this.featureOverlay.getFeatures(),
        type: geomType
    });

    this.map.addInteraction(this.interactions.draw);
    this.map.addInteraction(this.interactions.modify);
};

MapWidget.prototype.defaultCenter = function() {
    var center = [this.options.default_lon, this.options.default_lat];
    if (this.options.map_srid) {
        return ol.proj.transform(center, 'EPSG:4326', this.map.getView().getProjection());
    }
    return center;
};

MapWidget.prototype.enableDrawing = function() {
    this.interactions.draw.setActive(true);
    if (this.typeChoices) {
        // Show geometry type icons
        var divs = document.getElementsByClassName("switch-type");
        for(var i = 0; i != divs.length; i++) {
            divs[i].style.visibility = "visible";
        }
    }
};

MapWidget.prototype.disableDrawing = function() {
    if (this.interactions.draw) {
        this.interactions.draw.setActive(false);
        if (this.typeChoices) {
            // Hide geometry type icons
            var divs = document.getElementsByClassName("switch-type");
            for(var i = 0; i != divs.length; i++) {
                divs[i].style.visibility = "hidden";
            }
        }
    }
};

MapWidget.prototype.clearFeatures = function() {
    this.featureOverlay.getFeatures().clear();
    // Empty textarea widget
    document.getElementById(options.id).value = '';
    this.enableDrawing();
};

MapWidget.prototype.serializeFeatures = function() {
    // Three use cases: GeometryCollection, Multi geometries and single geometry
    if (this.options.isCollection) {
        var features = this.featureOverlay.getFeatures().getArray();
        if (this.options.geom_name == "GeometryCollection") {
            var geometries = [];
            for (var i = 0; i < features.length; i++) {
                geometries.push(features[i].getGeometry());
            }
            var geometry = new ol.geom.GeometryCollection(geometries);
        } else {
            var geometry = features[0].getGeometry().clone();
            for (var i = 1; i < features.length; i++) {
                switch(geometry.getType()) {
                    case "MultiPoint":
                        geometry.appendPoint(features[i].getGeometry().getPoint(0));
                        break;
                    case "MultiLineString":
                        geometry.appendLineString(features[i].getGeometry().getLineString(0));
                        break;
                    case "MultiPolygon":
                        geometry.appendPolygon(features[i].getGeometry().getPolygon(0));
                }
            }
        }
    } else {
        var geometry = this.featureOverlay.getFeatures().getArray()[0].getGeometry();
    }
    document.getElementById(this.options.id).value = jsonFormat.writeGeometry(geometry);
};

window.MapWidget = MapWidget;
})();
