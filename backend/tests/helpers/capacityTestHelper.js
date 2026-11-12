const receptionQueueRoutes = require('../../routes/receptionQueueRoutes');

module.exports = {
  checkDoctorDateAvailability: receptionQueueRoutes.checkDoctorDateAvailability,
  checkAndReserveDoctorCapacity: receptionQueueRoutes.checkAndReserveDoctorCapacity,
  calculateDoctorDailyBookedCount: receptionQueueRoutes.calculateDoctorDailyBookedCount
};
