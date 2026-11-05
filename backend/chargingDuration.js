
function calculateChargingDuration({
  batteryCapacityKwh,
  currentBatteryLevel,
  targetBatteryLevel,
  chargingPowerKw,
  efficiency = 0.90
}) {
  if (
    batteryCapacityKwh <= 0 ||
    chargingPowerKw <= 0 ||
    currentBatteryLevel < 0 ||
    targetBatteryLevel > 100 ||
    targetBatteryLevel <= currentBatteryLevel ||
    efficiency <= 0 ||
    efficiency > 1
  ) {
    throw new Error("Invalid charging calculation values");
  }

  const energyRequired =
    batteryCapacityKwh *
    (targetBatteryLevel - currentBatteryLevel) / 100;

  const chargingDurationMinutes = Math.ceil(
    (energyRequired / (chargingPowerKw * efficiency)) * 60
  );

  return {
    energyRequiredKwh: Number(energyRequired.toFixed(2)),
    chargingPowerKw,
    efficiency,
    estimatedDurationMinutes: chargingDurationMinutes
  };
}

module.exports = calculateChargingDuration;
