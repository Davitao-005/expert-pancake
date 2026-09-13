from artiq.experiment import *
from artiq.coredevice.ad9910 import PHASE_MODE_ABSOLUTE, PHASE_MODE_CONTINUOUS, PHASE_MODE_TRACKING


class E05MixedDdsTtl(EnvExperiment):
    def build(self):
        self.setattr_device("core")
        self.setattr_device("urukul0_cpld")
        self.setattr_device("urukul0_ch0")
        self.setattr_device("urukul0_ch1")
        self.setattr_device("ttl0")

    def prepare(self):

    @kernel
    def run_kernel(self):
        self.core.reset()
        self.core.break_realtime()
        self.urukul0_cpld.init()
        self.urukul0_ch0.init()
        self.urukul0_ch1.init()

        with parallel:
            # Channel: urukul0_ch0
            with sequential:
                self.urukul0_ch0.set_att(10.0 * dB)
                self.urukul0_ch0.set(80.0 * MHz, amplitude=0.5, phase=0.0 / 360.0, phase_mode=PHASE_MODE_ABSOLUTE)
                self.urukul0_ch0.sw.on()
                delay(3.0 * ms)
                self.urukul0_ch0.sw.off()
            # Channel: urukul0_ch1
            with sequential:
                delay(3.5 * ms)
                self.urukul0_ch1.set_att(10.0 * dB)
                self.urukul0_ch1.set(120.0 * MHz, amplitude=0.3, phase=0.0 / 360.0, phase_mode=PHASE_MODE_ABSOLUTE)
                self.urukul0_ch1.sw.on()
                delay(1.0 * ms)
                self.urukul0_ch1.sw.off()
            # Channel: ttl0
            with sequential:
                delay(1.0 * ms)
                self.ttl0.on()
                delay(0.2 * ms)
                self.ttl0.off()

        self.core.wait_until_mu(now_mu())

    def run(self):
        self.run_kernel()
