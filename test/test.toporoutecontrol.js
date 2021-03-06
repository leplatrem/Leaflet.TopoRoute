var assert = chai.assert;

describe('L.Mixin.ActivableControl', function() {

    var Control = L.Control.Zoom.extend({
        includes: L.Mixin.ActivableControl,
    });

    describe('Activable state', function() {

        it('should be deactivated by default', function(done) {
            var control = new Control();
            assert.isFalse(!!control._activable);
            done();
        });

        it('should become activable', function(done) {
            var control = new Control();
            control.activable(true);
            assert.isTrue(control._activable);
            control.activable(false);
            assert.isFalse(control._activable);
            done();
        });

        it('should not enable handler if not activable', function(done) {
            var control = new Control();
            control.handler = new L.Handler();
            assert.isFalse(control.handler.enabled());
            control.activate();
            assert.isFalse(control.handler.enabled());
            done();
        });

        it('should enable handler if activable', function(done) {
            var map = L.map('map');
            var control = (new Control()).addTo(map);
            control.handler = new L.Map.Drag(map);
            control.activable(true);
            assert.isFalse(control.handler.enabled());
            control.activate();
            assert.isTrue(control.handler.enabled());
            map.remove();
            done();
        });
    });

});


describe('L.Control.TopoRouteControl', function() {

    var map;

    beforeEach(function() {
        map = L.map('map').fitWorld();
    });

    afterEach(function() {
        map.remove();
    });


    describe('Initialization', function() {

        it('should be deactivated by default', function(done) {
            var control = new L.Control.TopoRouteControl();
            assert.isFalse(!!control._activable);
            done();
        });

        it('should fail if map has no almostOver handler', function(done) {
            var control = new L.Control.TopoRouteControl();
            delete map.almostOver;
            assert.throws(function () {control.addTo(map);}, 'Leaflet.AlmostOver required.');
            done();
        });

    });


    describe('Activation', function() {

        var control = new L.Control.TopoRouteControl();

        beforeEach(function() {
            control.addTo(map);
            control.handler.fire('ready');
        });

        it('should become activable one handler is ready', function(done) {
            assert.isTrue(control._activable);
            done();
        });

        it('should enable handler on click', function(done) {
            assert.isFalse(control.handler.enabled());
            var button = control._container.getElementsByTagName('a')[0];
            clickElement(button);
            assert.isTrue(control.handler.enabled());
            done();

            function clickElement(el) {
                var e = document.createEvent('MouseEvents');
                e.initMouseEvent('click', true, true, window,
                        0, 0, 0, 0, 0, false, false, false, false, 0, null);
                return el.dispatchEvent(e);
            }
        });
    });

});


describe('L.Handler.TopoRouteHandler', function() {

    var map,
        paths,
        handler;

    before(function() {
        map = L.map('map').fitWorld();

        paths = L.geoJson({features: []});
        var onepath = L.polyline([[0, 0], [0, 10]]);
        onepath.feature = {id: 1};
        paths.addLayer(onepath);
        paths.addTo(map);
    });

    beforeEach(function () {
        handler = new L.Handler.TopoRouteHandler(map);
        handler.setPathsLayer(paths);
    });

    after(function() {
        map.remove();
    });


    describe('Initalization', function() {

        it('should fire ready when paths are loaded', function(done) {
            var callback = sinon.spy();
            handler.on('ready', callback);
            paths.fire('data:loaded');
            assert.isTrue(callback.called);
            done();
        });

        it('should fire ready if paths are already loaded', function(done) {
            var callback = sinon.spy();
            handler.on('ready', callback);
            handler.setPathsLayer(paths);
            assert.isTrue(callback.called);
            done();
        });

        it('should add paths layer to polylineHandles guides', function(done) {
            var guides = [],
                polyguides = handler.polylineHandles._layers;
            for (var i=0, n=polyguides.length; i<n; i++)
                guides.push(L.stamp(polyguides[i]));
            assert.include(guides, L.stamp(paths));
            done();
        });

        it('should enable polyline handles when handler is enabled', function(done) {
            handler.enable();
            assert.isTrue(handler.polylineHandles.enabled());
            handler.disable();
            assert.isFalse(handler.polylineHandles.enabled());
            done();
        });
    });


    describe('Placing starting and end', function() {

        it('should attach start on first event', function(done) {
            var path = paths.getLayers()[0];
            var m = L.marker([0, 0]);
            handler.polylineHandles.fire('attach', {marker: m, layer: path});
            assert.equal(handler._start, m);
            done();
        });

        it('should attach end on second event', function(done) {
            var path = paths.getLayers()[0];
            handler.polylineHandles.fire('attach', {marker: L.marker([0, 0]), layer: path});
            var m = L.marker([1, 1]);
            handler.polylineHandles.fire('attach', {marker: m, layer: path});
            assert.equal(handler._end, m);
            done();
        });

        it('should compute when start and end are attached', function(done) {
            var callback = sinon.spy();
            handler.on('toporoute:compute', callback);
            var path = paths.getLayers()[0];
            handler.polylineHandles.fire('attach', {marker: L.marker([0, 0]), layer: path});
            handler.polylineHandles.fire('attach', {marker: L.marker([1, 1]), layer: path});
            assert.isTrue(callback.called);
            done();
        });

        it('should change cursor after adding start and end', function(done) {
            var path = paths.getLayers()[0];
            handler.enable();

            map.fire('almost:over', {latlng: [0, 0]});
            var start = handler.polylineHandles._marker.addTo(map);
            start.from = path;
            start.fire('click');
            assert.match(handler._start._icon.className, /marker\-source/);

            map.fire('almost:over', {latlng: [1, 0]});
            var end = handler.polylineHandles._marker.addTo(map);
            end.from = path;
            end.fire('click');
            assert.match(handler._end._icon.className, /marker\-target/);
            done();
        });
    });


    describe('Detaching starting and end', function() {

        var path,
            start,
            end;

        beforeEach(function () {
            path = paths.getLayers()[0];
            start = L.marker([0, 0]);
            end = L.marker([1, 1]);
            handler.polylineHandles.fire('attach', {marker: start, layer: path});
            handler.polylineHandles.fire('attach', {marker: end, layer: path});
        });

        it('should set null result', function(done) {
            var stub = sinon.stub(handler, "setResult");
            handler.polylineHandles.fire('detach', {marker: handler._start});
            assert.isNull(handler._start);
            assert.isTrue(stub.calledWithExactly(null));
            handler.polylineHandles.fire('detach', {marker: handler._end});
            assert.isNull(handler._end);
            assert.equal(2, stub.callCount);
            done();
        });

        it('should remove result layer', function(done) {
            handler._result = L.geoJson(null).addTo(map);
            handler.polylineHandles.fire('detach', {marker: handler._start});
            assert.isNull(handler._result);
            done();
        });

        it('should compute when detached marker is not start or end', function(done) {
            var callback = sinon.spy();
            handler.on('toporoute:compute', callback);
            handler.polylineHandles.fire('detach', {marker: L.marker([3.14, 0])});
            assert.isTrue(callback.called);
            done();
        });
    });


    describe('Data provided for compute event', function() {

        var path,
            start,
            end;

        beforeEach(function () {
            path = paths.getLayers()[0];
            start = L.marker([0, 1]);
            end = L.marker([0, 9]);
            handler.polylineHandles.fire('attach', {marker: start, layer: path});
            handler.polylineHandles.fire('attach', {marker: end, layer: path});
        });

        it('should provide start, end and via points', function(done) {
            var data;
            var middle = L.marker([0, 5]);
            handler.on('toporoute:compute', function (e) {data = e;});
            handler.polylineHandles.fire('attach', {marker: middle, layer: path});
            assert.equal(data.start.id, path.feature.id);
            assert.equal(data.start.position, 0.09999999999999964);
            assert.equal(data.end.id, path.feature.id);
            assert.equal(data.end.position, 0.9000000000000008);
            assert.equal(data.vias.length, 1);
            assert.equal(data.vias[0].id, path.feature.id);
            assert.equal(data.vias[0].position, 0.4999999999999982);
            done();
        });

        it('should remove via markers if detached', function(done) {
            var data;
            var middle = L.marker([0.5, 0]);
            handler.on('toporoute:compute', function (e) {data = e;});
            handler.polylineHandles.fire('attach', {marker: middle, layer: path});
            assert.equal(data.vias.length, 1);
            handler.polylineHandles.fire('detach', {marker: middle});
            assert.equal(data.vias.length, 0);
            done();
        });
    });


    describe('Result received', function() {

        beforeEach(function() {
            handler.setResult({ layers: [L.polyline([[20, 20], [20, 30]])] });
        });

        it('should add layer to the map', function(done) {
            assert.isTrue(map.hasLayer(handler._result));
            handler.setResult(null);
            assert.isFalse(map.hasLayer(handler._result));
            done();
        });

        it('should enable almost:over on result layer', function(done) {
            var callback = sinon.spy();
            map.on('almost:move', callback);
            map.fire('mousemovesample', {latlng: [10, 10]});
            assert.isTrue(callback.called);
            done();
        });

        it('should disable attach on click', function(done) {
            done();
        });

        it('should disable almost:over on paths layer', function(done) {
            done();
        });
    });

});
