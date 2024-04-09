

const { measurements: { measureBoundingBox, measureCenterOfMass }, transforms: { translateZ }, booleans: { union }, modifiers: {generalize}, geometries } = jscadModeling;

const { prepareRender, drawCommands, cameras, controls, entitiesFromSolids } = jscadReglRenderer

// Both `require` and the specified stl-serializer are coming from 
// the `stl-serializer.js` file included in demo.html.
// const stlSerializer = require('@jscad/stl-serializer');

const perspectiveCamera = cameras.perspective
const orbitControls = controls.orbit

function render(containerElement, solids) {

  const width = containerElement.clientWidth
  const height = containerElement.clientHeight

  const state = {}

  solids = restGeometryAtZ0(solids);

  // prepare the camera
  state.camera = Object.assign({}, perspectiveCamera.defaults, {
    target: measureCenterOfMass(union(solids))
  })

  perspectiveCamera.setProjection(state.camera, state.camera, { width, height })
  perspectiveCamera.update(state.camera, state.camera)

  // prepare the controls
  state.controls = orbitControls.defaults

  // prepare the renderer
  const setupOptions = {
    glOptions: { container: containerElement },
  }
  const renderer = prepareRender(setupOptions)

  const gridOptions = {
    visuals: {
      drawCmd: 'drawGrid',
      show: true
    },
    size: [500, 500],
    ticks: [25, 5],
    // color: [0, 0, 1, 1],
    // subColor: [0, 0, 1, 0.5]
  }

  const axisOptions = {
    visuals: {
      drawCmd: 'drawAxis',
      show: true
    },
    size: 300,
    // alwaysVisible: false,
    // xColor: [0, 0, 1, 1],
    // yColor: [1, 0, 1, 1],
    // zColor: [0, 0, 0, 1]
  }

  const entities = entitiesFromSolids({}, solids)

  // assemble the options for rendering
  const renderOptions = {
    camera: state.camera,
    drawCommands: {
      drawAxis: drawCommands.drawAxis,
      drawGrid: drawCommands.drawGrid,
      drawLines: drawCommands.drawLines,
      drawMesh: drawCommands.drawMesh
    },
    // define the visual content
    entities: [
      gridOptions,
      axisOptions,
      ...entities
    ]
  }

  // the heart of rendering, as themes, controls, etc change
  let updateView = true

  const doRotatePanZoom = () => {

    if (rotateDelta[0] || rotateDelta[1]) {
      const updated = orbitControls.rotate({ controls: state.controls, camera: state.camera, speed: rotateSpeed }, rotateDelta)
      state.controls = { ...state.controls, ...updated.controls }
      updateView = true
      rotateDelta = [0, 0]
    }

    if (panDelta[0] || panDelta[1]) {
      const updated = orbitControls.pan({ controls: state.controls, camera: state.camera, speed: panSpeed }, panDelta)
      state.controls = { ...state.controls, ...updated.controls }
      panDelta = [0, 0]
      state.camera.position = updated.camera.position
      state.camera.target = updated.camera.target
      updateView = true
    }

    if (zoomDelta) {
      const updated = orbitControls.zoom({ controls: state.controls, camera: state.camera, speed: zoomSpeed }, zoomDelta)
      state.controls = { ...state.controls, ...updated.controls }
      zoomDelta = 0
      updateView = true
    }
  }

  const updateAndRender = (timestamp) => {
    doRotatePanZoom()

    if (updateView) {
      const updates = orbitControls.update({ controls: state.controls, camera: state.camera })
      state.controls = { ...state.controls, ...updates.controls }
      updateView = state.controls.changed // for elasticity in rotate / zoom

      state.camera.position = updates.camera.position
      perspectiveCamera.update(state.camera)

      renderer(renderOptions)
    }
    window.requestAnimationFrame(updateAndRender)
  }
  window.requestAnimationFrame(updateAndRender)

  // convert HTML events (mouse movement) to viewer changes
  let lastX = 0
  let lastY = 0

  const rotateSpeed = 0.002
  const panSpeed = 1
  const zoomSpeed = 0.08
  let rotateDelta = [0, 0]
  let panDelta = [0, 0]
  let zoomDelta = 0
  let pointerDown = false

  const moveHandler = (ev) => {
    if (!pointerDown) return
    const dx = lastX - ev.pageX
    const dy = ev.pageY - lastY

    const shiftKey = (ev.shiftKey === true) || (ev.touches && ev.touches.length > 2)
    if (shiftKey) {
      panDelta[0] += dx
      panDelta[1] += dy
    } else {
      rotateDelta[0] -= dx
      rotateDelta[1] -= dy
    }

    lastX = ev.pageX
    lastY = ev.pageY

    ev.preventDefault()
  }
  const downHandler = (ev) => {
    pointerDown = true
    lastX = ev.pageX
    lastY = ev.pageY
    containerElement.setPointerCapture(ev.pointerId)
  }

  const upHandler = (ev) => {
    pointerDown = false
    containerElement.releasePointerCapture(ev.pointerId)
  }

  const wheelHandler = (ev) => {
    zoomDelta += ev.deltaY
    ev.preventDefault()
  }

  containerElement.onpointermove = moveHandler
  containerElement.onpointerdown = downHandler
  containerElement.onpointerup = upHandler
  containerElement.onwheel = wheelHandler

  // Make a button and have it float in the bottom right
  // attach downloadSTL to it as a handler
  const downloadButton = document.createElement('button');
  downloadButton.innerText = 'Download STL';
  downloadButton.addEventListener('click', () => {
    console.log('hi');
    downloadSTL(union(solids));
  });
  //attach as sibling
  containerElement.parentElement.appendChild(downloadButton);
}


function restGeometryAtZ0(geometry) {
  // Measure the bounding box of the geometry
  const boundingBox = measureBoundingBox(union(geometry))
  // Calculate the translation required to move the lowest Z point to Z=0
  const translationZ = -boundingBox[0][2]

  return translateZ(translationZ, geometry)
}

function downloadSTL(geometry) {
  let stlText = serializeSTL(geometry, ({progress}) => {
    console.log(progress);
  })
  
  const link = document.createElement('a');
  link.download = 'model.stl';
  link.href = 'data:text/plain,' + stlText;
  link.click();
}

function serializeSTL(geometry, statusCallback) {
  const toArray = (array) => {
    if (Array.isArray(array)) return array
    if (array === undefined || array === null) return []
    return [array]
  }

  // objects must be an array of 3D geomertries (with polygons)
  const serializeText = (objects, options) => {
    statusCallback && statusCallback({ progress: 0 })

    const result = `solid JSCAD
${convertToStl(objects, options)}
endsolid JSCAD
`
    statusCallback && statusCallback({ progress: 100 })
    return [result]
  }

  const convertToStl = (objects, options) => {
    const result = []
    objects.forEach((object, i) => {
      result.push(convertToFacets(object, options))
      statusCallback && statusCallback({ progress: 100 * i / objects.length })
    })
    return result.join('\n')
  }

  const convertToFacets = (object, options) => {
    const result = []
    const polygons = geometries.geom3.toPolygons(object)
    polygons.forEach((polygon, i) => {
      result.push(convertToFacet(polygon))
    })
    return result.join('\n')
  }

  const vector3DtoStlString = (v) => `${v[0]} ${v[1]} ${v[2]}`

  const vertextoStlString = (vertex) => `vertex ${vector3DtoStlString(vertex)}`

  const convertToFacet = (polygon) => {
    const result = []
    if (polygon.vertices.length >= 3) {
      // STL requires triangular polygons. If our polygon has more vertices, create multiple triangles:
      const firstVertexStl = vertextoStlString(polygon.vertices[0])
      for (let i = 0; i < polygon.vertices.length - 2; i++) {
        const facet = `facet normal ${vector3DtoStlString(geometries.poly3.plane(polygon))}
outer loop
${firstVertexStl}
${vertextoStlString(polygon.vertices[i + 1])}
${vertextoStlString(polygon.vertices[i + 2])}
endloop
endfacet`
        result.push(facet)
      }
    }
    return result.join('\n')
  }

  // convert to triangles
  let objects3d = toArray(generalize({ snap: true, triangulate: true }, geometry))

  return serializeText(objects3d)
}


export { render };