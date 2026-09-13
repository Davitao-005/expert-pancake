from artiq.experiment import *
from artiq.coredevice.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING


class E04SingleDds(EnvExperiment):
    def build(self):
        self.setattr_device("core")
        self.setattr_device("urukul0_cpld")
        self.setattr_device("urukul0_ch0")

    def prepare(self):

    @kernel
    def run_kernel(self):
        self.core.reset()
        self.core.break_realtime()
        self.urukul0_cpld.init()
        self.urukul0_ch0.init()

        self.urukul0_ch0.set_att(10.0 * dB)
        self.urukul0_ch0.set(80.0 * MHz, amplitude=0.5, phase=0.0 / 360.0, phase_mode=PHASE_MODE_ABSOLUTE)
        self.urukul0_ch0.sw.on()
        delay(2.0 * ms)
        self.urukul0_ch0.sw.off()

        self.core.wait_until_mu(now_mu())

    def run(self):
        self.run_kernel()
