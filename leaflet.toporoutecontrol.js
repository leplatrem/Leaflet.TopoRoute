L.Mixin.ActivableControl = {
    activable: function (state) {
        this._activable = state === undefined ? true : !!state;
        if (this._container) {
            if (state)
                L.DomUtil.removeClass(this._container, 'leaflet-disabled');
            else
                L.DomUtil.addClass(this._container, 'leaflet-disabled');
        }
    },

    activate: function () {
        if (!!!this._activable)
            return;  // do nothing if not activable

        this.handler.enable();
        L.DomUtil.addClass(this._container, 'active');
    },

    deactivate: function () {
        this.handler.disable();
        L.DomUtil.removeClass(this._container, 'active');
    },

    toggle: function() {
        if (this.handler.enabled())
            this.deactivate();
        else
            this.activate();
    },
};


L.Control.TopoRouteControl = L.Control.extend({

    includes: L.Mixin.ActivableControl,

    statics: {
        TITLE: 'Route',
        LABEL: 'o',
    },

    initialize: function (options) {
        L.Control.prototype.initialize.call(this, options);
        this.handler = null;
        this.router = null;
    },

    onAdd: function (map) {
        if (this._map.almostOver === undefined) {
            throw 'Leaflet.AlmostOver required.';
        }
        this.router = new L.TopoRouter(map);
        this.handler = new L.Handler.TopoRouteHandler(map);
        this.handler.on('ready', this.activable, this);
        this.handler.on('toporoute:remove', function (e) {
            this.router.clean();
        }, this);
        this.handler.on('toporoute:compute', function (e) {
            this.router.compute(e.data);
        }, this);
        return this._initContainer();
    },

    _initContainer: function () {
        var zoomName = 'leaflet-control-toporoute leaflet-control-zoom leaflet-disabled',
            barName = 'leaflet-bar',
            partName = barName + '-part',
            container = L.DomUtil.create('div', zoomName + ' ' + barName);
        var link = L.DomUtil.create('a', zoomName + '-in ' + partName, container);
        link.innerHTML = L.Control.TopoRouteControl.LABEL;
        link.href = '#';
        link.title = L.Control.TopoRouteControl.TITLE;
        this._button = link;

        var stop = L.DomEvent.stopPropagation;
        L.DomEvent
            .on(link, 'click', stop)
            .on(link, 'mousedown', stop)
            .on(link, 'dblclick', stop)
            .on(link, 'click', L.DomEvent.preventDefault)
            .on(link, 'click', function (e) {
                this.toggle();
            }, this);
        return container;
    },
});


L.Handler.TopoRouteHandler = L.Handler.extend({

    includes: L.Mixin.Events,

    initialize: function (map) {
        L.Handler.prototype.initialize.call(this, map);
        this.polylineHandles = null;
        this._pathsLayer = null;
        this._start = null;
        this._end = null;
        this._vias = [];
    },

    addHooks: function () {
        if (!this._pathsLayer)
            return;

        this.polylineHandles.enable();
        this._map.almostOver.enable();
    },

    removeHooks: function () {
        if (!this._pathsLayer)
            return;

        this.polylineHandles.disable();
    },

    setPathsLayer: function (pathsLayer) {
        this._pathsLayer = pathsLayer;
        if ((pathsLayer.getLayers()).length > 0) {
            this._onPathLoaded();
        }
        this._pathsLayer.on('data:loaded', this._onPathLoaded, this);
    },

    _onPathLoaded: function () {
        this._map.almostOver.addLayer(this._pathsLayer);

        this.polylineHandles = this._pathsLayer.getLayers()[0].polylineHandles;
        this.polylineHandles.addGuideLayer(this._pathsLayer);
        this.polylineHandles.on('attach', this._onAttached, this);
        this.polylineHandles.on('detach', this._onDetached, this);
        this.polylineHandles.options.markerFactory = this._getHandleMarker.bind(this);

        this.fire('ready');
    },

    _getHandleMarker: function (latlng) {
        var className = 'handle-icon';
        if (!this._start)
            className = 'marker-source';
        else if (!this._end)
            className = 'marker-target';
        var handleIcon = L.divIcon({className: className});
        return L.marker(latlng, {icon: handleIcon});
    },

    _onAttached: function (e) {
        var marker = e.marker,
            latlng = marker.getLatLng();

        marker.attached = e.layer;

        if (!this._start) {
            this._start = marker;
        }
        else if (!this._end) {
            this._end = marker;
        }
        else {
            this._vias.push(marker);
        }
        if (this._start && this._end) {
            this._computeRoute();
        }
    },

    _onDetached: function (e) {
        if (this._end === e.marker) {
            this._end = null;
        }
        else if (this._start === e.marker) {
            this._start = null;
        }
        else {
            // Remove from Via
            var index = this._vias.indexOf(e.marker);
            this._vias.splice(index, 1);
        }
        if (this._start && this._end) {
            this._computeRoute();
        }
        else {
            this.fire('toporoute:remove');
            setTimeout(L.Util.bind(function() {
                this.polylineHandles.enable();
            }, this), 0);
        }
    },

    _computeRoute: function () {
        var data = {
            start: {latlng: this._start.getLatLng(),
                    layer: this._start.attached},
            end: {latlng: this._end.getLatLng(),
                  layer: this._end.attached},
            via: []
        };
        for (var i=0, n=this._vias.length; i<n; i++) {
            data.via.push({latlng: this._vias[i].getLatLng(),
                           layer: this._vias[i].attached});
        }
        this.fire('toporoute:compute', {data: data});
        setTimeout(L.Util.bind(function() {
            this.polylineHandles.disable();
        }, this), 0);
    }
});


L.TopoRouter = L.Class.extend({
    initialize: function (map) {
        this._map = map;
        this._result = null;
    },

    compute: function (data) {
        this.clean();

        var latlngs = [];
        latlngs.push(data.start.latlng);
        for (var i=0, n=data.via.length; i<n; i++)
            latlngs.push(data.via[i].latlng);
        latlngs.push(data.end.latlng);

        this._result = L.polyline(latlngs).addTo(this._map);
    },

    clean: function () {
        if (this._result)
            this._map.removeLayer(this._result);
    }
});
