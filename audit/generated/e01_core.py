from artiq.experiment import *


class E01SingleTtl(EnvExperiment):
    def build(self):
        self.setattr_device("core")
        self.setattr_device("ttl0")

    def prepare(self):

    @kernel
    def run_kernel(self):
        self.core.reset()
        self.core.break_realtime()

        self.ttl0.on()
        delay(1.0 * ms)
        self.ttl0.off()

        self.core.wait_until_mu(now_mu())

    def run(self):
        self.run_kernel()
