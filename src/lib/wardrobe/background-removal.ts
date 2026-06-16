function colorDistance(a: Uint8ClampedArray, index: number, target: number[]) {
  const red = a[index] - target[0];
  const green = a[index + 1] - target[1];
  const blue = a[index + 2] - target[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function averageBorderColor(data: Uint8ClampedArray, width: number, height: number) {
  const samples: number[][] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 30));

  for (let x = 0; x < width; x += step) {
    samples.push([
      data[x * 4],
      data[x * 4 + 1],
      data[x * 4 + 2]
    ]);
    const bottom = ((height - 1) * width + x) * 4;
    samples.push([data[bottom], data[bottom + 1], data[bottom + 2]]);
  }

  for (let y = 0; y < height; y += step) {
    const left = y * width * 4;
    samples.push([data[left], data[left + 1], data[left + 2]]);
    const right = (y * width + width - 1) * 4;
    samples.push([data[right], data[right + 1], data[right + 2]]);
  }

  return samples
    .reduce(
      (acc, sample) => [acc[0] + sample[0], acc[1] + sample[1], acc[2] + sample[2]],
      [0, 0, 0]
    )
    .map((value) => value / samples.length);
}

function floodClearBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  background: number[]
) {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const threshold = 44;

  function enqueue(pixel: number) {
    if (pixel < 0 || pixel >= width * height || visited[pixel]) {
      return;
    }
    visited[pixel] = 1;
    queue.push(pixel);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (queue.length) {
    const pixel = queue.shift()!;
    const index = pixel * 4;

    if (colorDistance(data, index, background) > threshold) {
      continue;
    }

    data[index + 3] = 0;

    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }
}

export async function removeSimpleBackground(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Could not prepare the image for upload.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(bitmap, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const background = averageBorderColor(imageData.data, width, height);
  floodClearBackground(imageData.data, width, height, background);
  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png", 0.95);
  });

  if (!blob) {
    throw new Error("Could not export the cleaned image.");
  }

  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + "-clean.png",
    { type: "image/png" }
  );
}
