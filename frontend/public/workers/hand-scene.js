/* Reject carry-over motion across a camera cut/exposure jump. A hand moving
 * over a small part of the image is not a whole-scene transition. */
self.createHandSceneGuard = () => {
  let previous = null;
  return (pixels) => {
    let changed = 0;
    if (previous && previous.length === pixels.length) {
      for (let i=0;i<pixels.length;i+=4) {
        const delta=(Math.abs(pixels[i]-previous[i])+Math.abs(pixels[i+1]-previous[i+1])+Math.abs(pixels[i+2]-previous[i+2]))/3;
        if(delta>30)changed++;
      }
    }
    const cut=!!previous&&changed/(pixels.length/4)>.65;
    previous=new Uint8ClampedArray(pixels);
    return cut;
  };
};
