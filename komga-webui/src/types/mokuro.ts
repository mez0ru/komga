export interface MokuroObject {
  version: string
  title: string
  title_uuid: string
  volume: string
  volume_uuid: string
  pages: Page[]
}

export interface Page {
  version: string
  img_width: number
  img_height: number
  blocks: Block[]
  img_path: string
}

export interface Block {
  box: number[]
  vertical: boolean
  font_size: number
  lines_coords: number[][][]
  lines: string[]
}

export interface Bubble {
  left: number,
  top: number,
  width: number,
  height: number,
  imgWidth: number,
  imgHeight: number,
  text: string[],
  fontSize: number,
  vertical: boolean,
}

export class Mokuro {
  private mokuroObj: MokuroObject

  constructor(mokuroObj: MokuroObject) {
    this.mokuroObj = mokuroObj
  }

  getBubbleCount(page: number): number {
    return this.mokuroObj.pages[page].blocks.length
  }

  getPageCount(): number {
    return this.mokuroObj.pages.length
  }

  getBubble(bubbleIndex: number, page: number): Bubble | null {
    const mokuroPage = this.mokuroObj.pages[page]
    const mokuroBubble = mokuroPage.blocks[bubbleIndex]

    const bubble = {
      left: mokuroBubble.box[0],
      top: mokuroBubble.box[1],
      width: mokuroBubble.box[2]-mokuroBubble.box[0],
      height: mokuroBubble.box[3]-mokuroBubble.box[1],
      imgWidth: mokuroPage.img_width,
      imgHeight: mokuroPage.img_height,
      text: mokuroBubble.lines,
      fontSize: Math.min(Math.max(mokuroBubble.font_size, 12), 32),
      vertical: mokuroBubble.vertical,
    }
    return bubble
  }

  getBubbles(page: number): Bubble[] {
    const mokuroPage = this.mokuroObj.pages[page]
    const bubbles: Bubble[] = []
    for (const block of mokuroPage.blocks) {
      bubbles.push({
        left: block.box[0],
        top: block.box[1],
        width: block.box[2]-block.box[0],
        height: block.box[3]-block.box[1],
        imgWidth: mokuroPage.img_width,
        imgHeight: mokuroPage.img_height,
        text: block.lines,
        fontSize: Math.min(Math.max(block.font_size, 12), 32),
        vertical: block.vertical,
      })
    }
    return bubbles
  }
}
