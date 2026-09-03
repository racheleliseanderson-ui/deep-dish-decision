export function queueCityForBatch(batch) {
  return String(batch?.queueCity || batch?.city || "").trim();
}

export function batchMatchesCityFilter(batch, onlyCities) {
  if (!onlyCities) return true;
  const names = [batch?.city, batch?.queueCity]
    .filter(Boolean)
    .map((name) => String(name).trim().toLowerCase());
  return names.some((name) => onlyCities.includes(name));
}

export function findQueueTarget(queue, batch) {
  const queueCity = queueCityForBatch(batch);
  return queue?.cities?.find(
    (candidate) =>
      String(candidate.city || "")
        .trim()
        .toLowerCase() === queueCity.toLowerCase() && candidate.stateCode === batch?.stateCode,
  );
}
