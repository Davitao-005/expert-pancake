from artiq.experiment import *


class E03ParallelTtl(EnvExperiment):
    def build(self):
        self.setattr_device("core")
        self.setattr_device("ttl0")
        self.setattr_device("ttl1")

    def prepare(self):

    @kernel
    def run_kernel(self):
        self.core.reset()
        self.core.break_realtime()

        with parallel:
            # Channel: ttl0
            with sequential:
                self.ttl0.on()
                delay(3.0 * ms)
                self.ttl0.off()
            # Channel: ttl1
            with sequential:
                delay(1.0 * ms)
                self.ttl1.on()
                delay(1.0 * ms)
                self.ttl1.off()

        self.core.wait_until_mu(now_mu())

    def run(self):
        self.run_kernel()
