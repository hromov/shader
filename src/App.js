import { Html, OrbitControls, PerspectiveCamera, shaderMaterial, Stats, useTexture } from '@react-three/drei'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber'
import { Leva, useControls } from 'leva'
import { useLayoutEffect, useRef } from 'react'
import { Color, LinearFilter, MathUtils, Vector2, Vector3 } from 'three'

const PolarTextureMaterial = shaderMaterial(
  {
    zoom: 3,
    twist: 0.2,
    time: 3,
    rotateSpeed: -0.3,
    scaleSpeed: 0.38,
    vignette: 1.55,
    debug: false,
    map: null,
    tint: new Color('green'),
    tintIntensity: 13.8,
    bgIntensity: 1.2,
    frequency: 5.83,
    amplitude: 0.5,
    speed: 3.6,
    pointer: new Vector2(0.5, 0.5)
  },
  `
    #define TWO_PI 6.283185307179586

    uniform float time;
    uniform float frequency;
    uniform float amplitude;
    uniform float speed;

    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 pos = position;

      float displaceY = sin(uv.x * TWO_PI * frequency + time * speed) * amplitude;
      float displaceX = sin(uv.y * TWO_PI * frequency + time * speed) * amplitude;

      pos.z = displaceX + displaceY;
      pos.x += displaceX;
      pos.y += displaceY;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  `
    uniform float time;
    uniform sampler2D map;
    uniform vec2 pointer;
    uniform float zoom;
    uniform float twist;
    uniform float rotateSpeed;
    uniform float scaleSpeed;
    uniform float vignette;
    uniform float debug;
    uniform vec3 tint;
    uniform float tintIntensity;
    uniform float bgIntensity;

    #define TWO_PI 6.283185307179586

    varying vec2 vUv;

    vec2 toPolar(vec2 cartesian) {
      float distance = pow(length(cartesian), zoom);
      float angle = atan(cartesian.y, cartesian.x);
      return vec2(angle / TWO_PI, distance);
    }

    float mapLinear(float value, float min1, float max1, float min2, float max2) {
      return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
    }

    void main() {
      vec2 myUv = vUv;

      vec2 pointer = vec2(pointer);

      // Distort UV so we can move the center
      vec2 dUv = myUv;

      // Smoothstep doesn't look good - it's not a linear mapping
      // dUv = mix(vec2(0.), vec2(0.5), smoothstep(vec2(0.0), vec2(pointer), vUv));
      // dUv = mix(dUv, vec2(1.0), smoothstep(vec2(pointer), vec2(1.0), vUv));

      // remap UV linearly so 0.5,0.5 is where the pointer is
      dUv.x = mapLinear(min(vUv.x, pointer.x), 0.0, pointer.x, .0, 0.5);
      dUv.x = mapLinear(max(vUv.x, pointer.x), pointer.x, 1.0, dUv.x, 1.0);
      dUv.y = mapLinear(min(vUv.y, pointer.y), 0.0, pointer.y, 0., 0.5);
      dUv.y = mapLinear(max(vUv.y, pointer.y), pointer.y, 1.0, dUv.y, 1.0);

      // mix distorted UV with normal UV base on distance to position
      //  i.e. distort mostly where the pointer is
      myUv = mix(dUv, myUv, distance(pointer, vUv));

      // normalize UVs to -1, 1
      vec2 uv = (myUv.xy - 0.5) * 2.0;

      // convert UVs to polar coordinates
      vec2 polarUv = toPolar(uv);
      
      // repeat tiled texture
      // polarUv *= 2.0; // repeat=2

      // twist polar coordinates
      polarUv += vec2(time * rotateSpeed + polarUv.y * twist, time * scaleSpeed);

      // sample texture using polar UVs
      vec4 color = texture2D(map, fract(polarUv));

      // fade out at edges
      float alpha = pow(1. - length(uv), vignette);

      // tint color
      if (debug == 0.0) {
        color.rgb *= tint * tintIntensity;
        color.rgb += tint * bgIntensity;
      }

      gl_FragColor = vec4(color.rgb, vignette == 0.0 ? 1.0 : alpha);

    }
  `
)

extend({ PolarTextureMaterial })

const CAUSTICS_TEXTURE = 'rt_caustics_grayscale.png'
const DEBUG_TEXTURE = 'uv-checker.png'

function Plane(props) {
  const material = useRef()
  const { gl } = useThree()
  const debugMesh = useRef()
  const lerpTarget = useRef({ uv: new Vector2(0.5, 0.5), tube: new Vector3(0.5, 0.5, 0.5) }).current

  const texture = useTexture(CAUSTICS_TEXTURE)
  const debugTexture = useTexture(DEBUG_TEXTURE)

  useLayoutEffect(() => {
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.minFilter = LinearFilter // avoid seam where polar coordinates meet
  }, [texture, gl])

  useFrame(({ clock, pointer }) => {
    material.current.uniforms.time.value = clock.getElapsedTime()
    // lerp center to pointer
    debugMesh.current.position.lerp(lerpTarget.tube, 0.05)
    material.current.uniforms.pointer.value.lerp(lerpTarget.uv, 0.05)
  })

  const vertexProps = useControls('displacement', {
    amplitude: { value: 0.5, min: 0, max: 0.5, step: 0.01 },
    frequency: { value: 5.83, min: 1, max: 10 },
    speed: { value: 3.6, min: 1, max: 20 }
  })

  const fragmentProps = useControls('effect', {
    zoom: { value: 3, min: 0.01, max: 5 },
    twist: { value: 0.2, min: -1, max: 1 },
    rotateSpeed: { value: -0.3, min: -1, max: 1, step: 0.01 },
    scaleSpeed: { value: 0.38, min: -1, max: 1 },
    vignette: { value: 1.55, min: 0, max: 5 },
    tint: '#1b15c4',
    tintIntensity: { value: 13.8, min: 0, max: 20 },
    bgIntensity: { value: 1.2, min: 0, max: 20 }
  })

  const { showTexture, trackPointer, ...matProps } = useControls({
    debug: false,
    transparent: true,
    wireframe: false,
    trackPointer: true,
    showTexture: false
  })

  const size = 5

  return (
    <>
      <mesh
        {...props}
        rotation-x={Math.PI * -0.5}
        onPointerMove={(e) => {
          if (trackPointer) {
            lerpTarget.uv.set(MathUtils.clamp(e.uv.x, 0.3, 0.7), MathUtils.clamp(e.uv.y, 0.3, 0.7))
            lerpTarget.tube.set(MathUtils.clamp(e.point.x, size * -0.2, size * 0.2), 0.5, MathUtils.clamp(e.point.z, 5 * -0.2, 5 * 0.2))
          }
        }}
        onPointerOut={(e) => {
          lerpTarget.uv.set(0.5, 0.5)
          lerpTarget.tube.set(0, 0.5, 0)
        }}>
        <planeGeometry args={[size, size, 128, 128]} />
        <polarTextureMaterial
          ref={material}
          map={matProps.debug ? debugTexture : texture}
          key={PolarTextureMaterial.key}
          {...matProps}
          {...vertexProps}
          {...fragmentProps}
        />
      </mesh>
      <mesh visible={matProps.debug} ref={debugMesh} position={[0, 0.5, 0]} rotation-x={Math.PI * -0}>
        <cylinderGeometry args={[0.1, 0.1, 1, 64]} />
        <meshNormalMaterial />
      </mesh>
      {showTexture && (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
          <img className="debugTexture" src={matProps.debug ? DEBUG_TEXTURE : CAUSTICS_TEXTURE} alt="debug" />
        </Html>
      )}
    </>
  )
}

export default function App() {
  const { fps, background } = useControls({
    background: '#42555f',
    fps: false
  })
  return (
    <>
      <Canvas gl={{ alpha: false }}>
        <color args={[background]} attach="background" />
        <PerspectiveCamera makeDefault position={[0, 4, 0]} />
        <Plane />
        <OrbitControls />
      </Canvas>
      <Leva collapsed />
      {fps && <Stats />}
    </>
  )
}
