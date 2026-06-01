const { getLlama, getLlamaGpuTypes } = await import("node-llama-cpp");

const gpuTypes = await getLlamaGpuTypes();
const llama = await getLlama();

try {
  const selected = llama.gpu;
  const ok = selected !== false;
  const payload = {
    ok,
    availableGpuTypes: gpuTypes,
    selectedGpu: selected,
    gpuSupportsMmap: llama.gpuSupportsMmap
  };
  console.log(JSON.stringify(payload, null, 2));
  if (!ok && gpuTypes.some((type) => type !== false)) {
    process.exitCode = 1;
  }
} finally {
  await llama.dispose();
}
