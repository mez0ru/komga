<template>
  <div
    v-touch="{
               left: () => {if(swipe) {turnRight()}},
               right: () => {if(swipe) {turnLeft()}},
               up: () => {if(swipe) {verticalNext()}},
               down: () => {if(swipe) {verticalPrev()}}
             }"
  >
    <v-carousel v-model="carouselPage"
                :show-arrows="false"
                :continuous="false"
                :reverse="flipDirection"
                :vertical="vertical"
                hide-delimiters
                touchless
                height="100%"
    >
      <!--  Carousel: pages  -->
      <v-carousel-item v-for="(spread, i) in spreads"
                       :key="`spread${i}`"
                       :eager="eagerLoad(i)"
                       class="full-height"
                       :class="preRender(i) ? 'pre-render' : ''"
                       :transition="animations ? undefined : false"
                       :reverse-transition="animations ? undefined : false"
      >
        <div class="unicode-isolate full-height d-flex flex-column justify-center">
          <div :class="`d-flex flex-row${flipDirection ? '-reverse' : ''} justify-center px-0 mx-0`">
            <div v-for="(page, j) in spread"
                  :key="`spread${i}-${j}`"
                  class="relative"
                  ref="overlay"
                  :data-id="page.number"
                >
                <img :alt="`Page ${page.number}`"
                     :src="page.url"
                     :class="imgClass(spread)"
                     class="img-fit-all"
                />
              <template v-if="mokuro">
                <div v-for="(overlay, y) in overlays(page.number)"
                  :key="`overlay-${page.number}-${y}`"
                  class="overlay"
                  :style="{'writing-mode': overlay.vertical ? 'vertical-rl' : null }"
                >
                  <p v-for="(line, z) in overlay.text" :key="`line-${page.number}-${y}-${z}`">
                    {{ line }}
                    </p>
                </div>
              </template>
            </div>
          </div>
        </div>
      </v-carousel-item>
    </v-carousel>

    <!--  clickable zone: left  -->
    <div v-if="!vertical"
         @click="turnLeft()"
         class="left-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: right  -->
    <div v-if="!vertical"
         @click="turnRight()"
         class="right-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: top  -->
    <div v-if="vertical"
         @click="verticalPrev()"
         class="top-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: bottom  -->
    <div v-if="vertical"
         @click="verticalNext()"
         class="bottom-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: menu  -->
    <div @click="centerClick()"
         :class="`${vertical ? 'center-vertical' : 'center-horizontal'}`"
         style="z-index: 1;"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {ReadingDirection} from '@/types/enum-books'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'
import {shortcutsLTR, shortcutsRTL, shortcutsVertical} from '@/functions/shortcuts/paged-reader'
import {PageDtoWithUrl} from '@/types/komga-books'
import {buildSpreads} from '@/functions/book-spreads'
import { Bubble, Mokuro } from '@/types/mokuro'

const canvas = document.createElement('canvas')
const context = canvas.getContext('2d')

function measureTextWidth(text: string, fontSize: number, fontFace: string) {
  context!.font = `500 ${fontSize}px ${fontFace}`
  return context!.measureText(text).width // standard canvas usage
}

export default Vue.extend({
  name: 'PagedReader',
  data: function () {
    return {
      logger: 'PagedReader',
      carouselPage: 0,
      spreads: [] as PageDtoWithUrl[][],
      fakeToRealPageMap: {} as Record<number, number>,
      observer: null as IntersectionObserver | null,
      resizeListeners: {} as Record<number, () => void>,
    }
  },
  props: {
    pages: {
      type: Array as () => PageDtoWithUrl[],
      required: true,
    },
    page: {
      type: Number,
      required: true,
    },
    pageLayout: {
      type: String as () => PagedReaderLayout,
      required: true,
    },
    animations: {
      type: Boolean,
      required: true,
    },
    swipe: {
      type: Boolean,
      required: true,
    },
    readingDirection: {
      type: String as () => ReadingDirection,
      required: true,
    },
    scale: {
      type: String as () => ScaleType,
      required: true,
    },
    mokuro: {
      type: Mokuro,
      required: false,
    },
  },
  watch: {
    pages: {
      handler(val) {
        this.spreads = buildSpreads(val, this.pageLayout)
      },
      immediate: true,
    },
    carouselPage(val, old) {
      this.$debug('[watch:carouselPage', `old:${old}`, `new:${val}`)
      if (this.carouselPage >= 0 && this.carouselPage < this.spreads.length && this.spreads.length > 0) {
        const currentSpread = this.spreads[this.carouselPage]
        const currentPage = currentSpread.length == 2 && currentSpread[1].mediaType ? currentSpread[1] : currentSpread[0]
        this.$emit('update:page', currentPage.number)
      } else {
        this.$emit('update:page', 1)
      }
      if (this.mokuro) {
        this.$nextTick(() => {
          this.updateObservedElements()
        })
      }
    },
    page(val, old) {
      this.$debug('[watch:page]', `old:${old}`, `new:${val}`)
      const spreadIndex = this.toSpreadIndex(val)
      this.$debug('[watch:page]', `toSpreadIndex:${spreadIndex}`)
      this.carouselPage = spreadIndex
    },
    pageLayout: {
      handler(val) {
        const current = this.page
        this.spreads = buildSpreads(this.pages, val)
        this.carouselPage = this.toSpreadIndex(current)
      },
      immediate: true,
    },
  },
  mounted() {
    if (this.mokuro){
        this.$nextTick(() => {
          this.initMultiObserver()
        })
    }
  },
  created() {
    // Distinguish between filler pages and real pages
    if (this.mokuro) {
      let realPageNumber = 0
      this.pages.forEach((page, _) => {
        if (page.fileName === null) {
          this.fakeToRealPageMap[page.number] = -1
        } else {
          this.fakeToRealPageMap[page.number] = realPageNumber
          realPageNumber++
        }
      })
      if (!(0 in this.fakeToRealPageMap)) {
        this.fakeToRealPageMap[0] = -1
      }
    }
    window.addEventListener('keydown', this.keyPressed)
  },
  beforeDestroy() {
    if (this.mokuro && this.observer) {
      this.observer.disconnect()
    }
  },
  destroyed() {
    window.removeEventListener('keydown', this.keyPressed)
  },
  computed: {
    shortcuts(): any {
      const shortcuts = []
      switch (this.readingDirection) {
        case ReadingDirection.LEFT_TO_RIGHT:
          shortcuts.push(...shortcutsLTR)
          break
        case ReadingDirection.RIGHT_TO_LEFT:
          shortcuts.push(...shortcutsRTL)
          break
        case ReadingDirection.VERTICAL:
          shortcuts.push(...shortcutsVertical)
          break
      }
      return this.$_.keyBy(shortcuts, x => x.key)
    },
    flipDirection(): boolean {
      return this.readingDirection === ReadingDirection.RIGHT_TO_LEFT
    },
    vertical(): boolean {
      return this.readingDirection === ReadingDirection.VERTICAL
    },
    currentSlide(): number {
      return this.carouselPage + 1
    },
    slidesCount(): number {
      return this.spreads.length
    },
    canPrev(): boolean {
      return this.currentSlide > 1
    },
    canNext(): boolean {
      return this.currentSlide < this.slidesCount
    },
    isDoublePages(): boolean {
      return this.pageLayout === PagedReaderLayout.DOUBLE_PAGES || this.pageLayout === PagedReaderLayout.DOUBLE_NO_COVER
    },
  },
  methods: {
    initMultiObserver() {
      const elements = this.$refs.overlay as Element[] | undefined
      if (!elements || elements.length === 0) return
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const page = Number(entry.target.getAttribute('data-id'))
          this.handleElementVisibility(entry.target, page, entry.isIntersecting)
        })
      }, {
        root: null,
        threshold: 0.2, // Triggers when 20% of an item is visible
      })

      elements.forEach((el) => {
        this.observer?.observe(el)
      })
    },
    updateObservedElements() {
      if (!this.observer) return

      const elements = this.$refs.overlay as Element[] | undefined
      if (!elements) return

      elements.forEach((el) => {
        // Safe optimization: `.observe()` automatically ignores elements
        // it is already tracking, keeping this call incredibly lightweight.
        this.observer!.observe(el)
      })
    },
    handleElementVisibility(elm: Element, page: number, isVisible: boolean) {
      if (isVisible) {
        this.makeBubbles(elm, page)
      } else {
        if (page in this.resizeListeners) {
          window.removeEventListener('resize', this.resizeListeners[page])
          delete this.resizeListeners[page]
        }
      }
    },
    keyPressed(e: KeyboardEvent) {
      this.shortcuts[e.key]?.execute(this)
    },
    imgClass(spread: PageDtoWithUrl[]): string {
      const double = spread.length > 1
      switch (this.scale) {
        case ScaleType.WIDTH:
          return double ? 'img-double-fit-width' : 'img-fit-width'
        case ScaleType.WIDTH_SHRINK_ONLY:
          return double ? 'img-double-fit-width-shrink-only' : 'img-fit-width-shrink-only'
        case ScaleType.HEIGHT:
          return 'img-fit-height'
        case ScaleType.SCREEN:
          return double ? 'img-double-fit-screen' : 'img-fit-screen'
        default:
          return 'img-fit-original'
      }
    },
    eagerLoad(spreadIndex: number): boolean {
      return Math.abs(this.carouselPage - spreadIndex) <= 2
    },
    preRender(spreadIndex: number): boolean {
      return Math.abs(this.carouselPage - spreadIndex) > (this.animations ? 1 : 0)
    },
    centerClick() {
      this.$emit('menu')
    },
    turnRight() {
      if (!this.vertical)
        this.flipDirection ? this.prev() : this.next()
    },
    turnLeft() {
      if (!this.vertical)
        this.flipDirection ? this.next() : this.prev()
    },
    verticalPrev() {
      if (this.vertical) this.prev()
    },
    verticalNext() {
      if (this.vertical) this.next()
    },
    prev() {
      if (this.canPrev) {
        this.carouselPage--
        window.scrollTo(0, 0)
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      if (this.canNext) {
        this.carouselPage++
        window.scrollTo(0, 0)
      } else {
        this.$emit('jump-next')
      }
    },
    toSpreadIndex(i: number): number {
      this.$debug('[toSpreadIndex]', `i:${i}`, `isDoublePages:${this.isDoublePages}`)
      if (this.spreads.length > 0) {
        if (this.isDoublePages) {
          for (let j = 0; j < this.spreads.length; j++) {
            for (let k = 0; k < this.spreads[j].length; k++) {
              if (this.spreads[j][k].number === i) {
                return j
              }
            }
          }
        } else {
          return i - 1
        }
      }
      return i - 1
    },
    overlays(page: number) {
      const realPage = this.fakeToRealPageMap[page]
      if (realPage !== -1) {
        return this.mokuro.getBubbles(this.fakeToRealPageMap[page])
      }
      return []
    },
    makeBubbles(overlayElm: Element, page: number) {
      const updateBubbles = (bubbles: Bubble[], img: HTMLImageElement, overlays: HTMLDivElement[]) => {
        function updateOverlays() {
          for (let i = 0; i < bubbles.length; i++) {
            const currentWidth = img.offsetWidth
            const currentHeight = img.offsetHeight
            const scaleW = currentWidth / bubbles[i].imgWidth
            const scaleH = currentHeight / bubbles[i].imgHeight

            // Apply horizontal and vertical scaling
            overlays[i].style.left = (bubbles[i].left * scaleW) + 'px'
            overlays[i].style.top = (bubbles[i].top * scaleH) + 'px'

            overlays[i].style.width = (bubbles[i].width * scaleW) + 'px'
            overlays[i].style.height = (bubbles[i].height * scaleH) + 'px'

            let fontSize = (bubbles[i].fontSize * scaleW)
            if (bubbles[i].vertical) {
              const actualWidth = measureTextWidth(bubbles[i].text.reduce((a, b) => a.length >= b.length ? a : b), fontSize, 'Noto Sans JP')
              const absoluteTP = overlays[i].offsetTop
              if (actualWidth > window.innerHeight - absoluteTP) {
                fontSize = (window.innerHeight - absoluteTP) / actualWidth * 0.8 * fontSize
              }
            }
            overlays[i].style.fontSize = fontSize + 'px'
          }
        }

        window.addEventListener('resize', updateOverlays)
        this.resizeListeners[page] = updateOverlays

        if (img.complete) updateOverlays()
        else img.addEventListener('load', updateOverlays)
      }

      const realPage = this.fakeToRealPageMap[page]
      if (realPage === -1)
        return
      const bubbleCount = this.mokuro.getBubbleCount(realPage)
      if (bubbleCount > 0) {
        let img = overlayElm.children[0] as HTMLImageElement
        let overlays = Array.from(overlayElm.children).slice(1)

        updateBubbles(this.mokuro.getBubbles(realPage), img, overlays as HTMLDivElement[])
      }
    },
  },
})
</script>
<style scoped>

.full-height {
  height: 100%;
}

.unicode-isolate {
  unicode-bidi: isolate;
}

.left-quarter {
  top: 0;
  left: 0;
  width: 25%;
  height: 100%;
  position: absolute;
}

.right-quarter {
  top: 0;
  right: 0;
  width: 25%;
  height: 100%;
  position: absolute;
}

.top-quarter {
  top: 0;
  height: 25%;
  width: 100%;
  position: absolute;
}

.bottom-quarter {
  bottom: 0;
  height: 25%;
  width: 100%;
  position: absolute;
}

.center-horizontal {
  top: 0;
  left: 25%;
  width: 50%;
  height: 100%;
  position: absolute;
}

.center-vertical {
  top: 25%;
  height: 50%;
  width: 100%;
  position: absolute;
}

.img-fit-all {
  object-fit: contain;
  object-position: center;
}

.img-fit-width {
  width: 100vw;
  min-height: 100vh;
  align-self: flex-start;
}

.img-double-fit-width {
  width: 50vw;
  min-height: 100vh;
  align-self: flex-start;
}

.img-fit-width-shrink-only {
  max-width: 100vw;
  align-self: flex-start;
}

.img-double-fit-width-shrink-only {
  max-width: 50vw;
  align-self: flex-start;
}

.img-fit-original {
  width: auto;
  height: auto;
}

.img-fit-height {
  min-height: 100vh;
  height: 100vh;
}

.img-fit-screen {
  width: 100vw;
  height: 100vh;
}

.img-double-fit-screen {
  max-width: 50vw;
  height: 100vh;
}

.pre-render {
  display: block !important;
  position: fixed;
  right: -1000vw;
  top: -1000vh;
}

.relative {
  position: relative
}

.overlay {
  position: absolute;
  z-index: 2;
  box-sizing: border-box;
  pointer-events: auto;
  font-family: "Noto Sans JP", sans-serif;
  font-optical-sizing: auto;
  font-weight: 500;
}

.overlay:hover p {
  display: table;
}

.overlay:hover {
  background-color: white;
  border: 1px solid rgba(0,0,0,0);
  z-index: 999 !important;
}

.overlay p {
  display: none;
  white-space: nowrap;
  letter-spacing: 0.1em;
  line-height: 1.1em;
  margin: 0;
  background-color: white;
  color: black;
}

.v-carousel {
  position: relative;
  z-index: 2;
  pointer-events: none;
}
</style>
