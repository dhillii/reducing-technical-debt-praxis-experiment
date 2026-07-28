class DictionaryProbDist(ProbDistI):
    """
    A probability distribution whose probabilities are directly
    specified by a given dictionary.  The given dictionary maps
    samples to probabilities.
    """
    def __init__(self, prob_dict=None, log=False, normalize=False):
        """
        Construct a new probability distribution from the given
        dictionary, which maps values to probabilities (or to log
        probabilities, if ``log`` is true).  If ``normalize`` is
        true, then the probability values are scaled by a constant
        factor such that they sum to 1.

        If called without arguments, the resulting probability
        distribution assigns zero probability to all values.
        """

        self._prob_dict = (prob_dict.copy() if prob_dict is not None else {})
        self._log = log

        # Normalize the distribution, if requested.
        if normalize:
            if len(prob_dict) == 0:
                raise ValueError('A DictionaryProbDist must have at least one sample ' +
                             'before it can be normalized.')
            if log:
                value_sum = sum_logs(list(self._prob_dict.values()))
                if value_sum <= _NINF:
                    logp = math.log(1.0/len(prob_dict), 2)
                    for x in prob_dict:
                        self._prob_dict[x] = logp
                else:
                    for (x, p) in self._prob_dict.items():
                        self._prob_dict[x] -= value_sum
            else:
                value_sum = sum(self._prob_dict.values())
                if value_sum == 0:
                    p = 1.0/len(prob_dict)
                    for x in prob_dict:
                        self._prob_dict[x] = p
                else:
                    norm_factor = 1.0/value_sum
                    for (x, p) in self._prob_dict.items():
                        self._prob_dict[x] *= norm_factor

    def prob(self, sample):
        if self._log:
            return (2**(self._prob_dict[sample]) if sample in self._prob_dict else 0)
        else:
            return self._prob_dict.get(sample, 0)

    def logprob(self, sample):
        if self._log:
            return self._prob_dict.get(sample, _NINF)
        else:
            if sample not in self._prob_dict: return _NINF
            elif self._prob_dict[sample] == 0: return _NINF
            else: return math.log(self._prob_dict[sample], 2)

    def max(self):
        if not hasattr(self, '_max'):
            self._max = max((p,v) for (v,p) in self._prob_dict.items())[1]
        return self._max
    def samples(self):
        return self._prob_dict.keys()
    def __repr__(self):
        return '<ProbDist with %d samples>' % len(self._prob_dict)


class LidstoneProbDist(ProbDistI):
    """
    The Lidstone estimate for the probability distribution of the
    experiment used to generate a frequency distribution.  The
    "Lidstone estimate" is parameterized by a real number *gamma*,
    which typically ranges from 0 to 1.  The Lidstone estimate
    approximates the probability of a sample with count *c* from an
    experiment with *N* outcomes and *B* bins as
    ``c+gamma)/(N+B*gamma)``.  This is equivalent to adding
    *gamma* to the count for each bin, and taking the maximum
    likelihood estimate of the resulting frequency distribution.
    """
    SUM_TO_ONE = False
    def __init__(self, freqdist, gamma, bins=None):
        """
        Use the Lidstone estimate to create a probability distribution
        for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type gamma: float
        :param gamma: A real number used to parameterize the
            estimate.  The Lidstone estimate is equivalent to adding
            *gamma* to the count for each bin, and taking the
            maximum likelihood estimate of the resulting frequency
            distribution.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        if (bins == 0) or (bins is None and freqdist.N() == 0):
            name = self.__class__.__name__[:-8]
            raise ValueError('A %s probability distribution ' % name +
                             'must have at least one bin.')
        if (bins is not None) and (bins < freqdist.B()):
            name = self.__class__.__name__[:-8]
            raise ValueError('\nThe number of bins in a %s distribution ' % name +
                             '(%d) must be greater than or equal to\n' % bins +
                             'the number of bins in the FreqDist used ' +
                             'to create it (%d).' % freqdist.B())

        self._freqdist = freqdist
        self._gamma = float(gamma)
        self._N = self._freqdist.N()

        if bins is None:
            bins = freqdist.B()
        self._bins = bins

        self._divisor = self._N + bins * gamma
        if self._divisor == 0.0:
            # In extreme cases we force the probability to be 0,
            # which it will be, since the count will be 0:
            self._gamma = 0
            self._divisor = 1

    def freqdist(self):
        """
        Return the frequency distribution that this probability
        distribution is based on.

        :rtype: FreqDist
        """
        return self._freqdist

    def prob(self, sample):
        c = self._freqdist[sample]
        return (c + self._gamma) / self._divisor

    def max(self):
        # For Lidstone distributions, probability is monotonic with
        # frequency, so the most probable sample is the one that
        # occurs most frequently.
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def discount(self):
        gb = self._gamma * self._bins
        return gb / (self._N + gb)

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<LidstoneProbDist based on %d samples>' % self._freqdist.N()


class LaplaceProbDist(LidstoneProbDist):
    """
    The Laplace estimate for the probability distribution of the
    experiment used to generate a frequency distribution.  The
    "Laplace estimate" approximates the probability of a sample with
    count *c* from an experiment with *N* outcomes and *B* bins as
    *(c+1)/(N+B)*.  This is equivalent to adding one to the count for
    each bin, and taking the maximum likelihood estimate of the
    resulting frequency distribution.
    """
    def __init__(self, freqdist, bins=None):
        """
        Use the Laplace estimate to create a probability distribution
        for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        LidstoneProbDist.__init__(self, freqdist, 1, bins)

    def __repr__(self):
        """
        :rtype: str
        :return: A string representation of this ``ProbDist``.
        """
        return '<LaplaceProbDist based on %d samples>' % self._freqdist.N()


class ELEProbDist(LidstoneProbDist):
    """
    The expected likelihood estimate for the probability distribution
    of the experiment used to generate a frequency distribution.  The
    "expected likelihood estimate" approximates the probability of a
    sample with count *c* from an experiment with *N* outcomes and
    *B* bins as *(c+0.5)/(N+B/2)*.  This is equivalent to adding 0.5
    to the count for each bin, and taking the maximum likelihood
    estimate of the resulting frequency distribution.
    """
    def __init__(self, freqdist, bins=None):
        """
        Use the expected likelihood estimate to create a probability
        distribution for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        LidstoneProbDist.__init__(self, freqdist, 0.5, bins)

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<ELEProbDist based on %d samples>' % self._freqdist.N()


class HeldoutProbDist(ProbDistI):
    """
    The heldout estimate for the probability distribution of the
    experiment used to generate two frequency distributions.  These
    two frequency distributions are called the "heldout frequency
    distribution" and the "base frequency distribution."  The
    "heldout estimate" uses uses the "heldout frequency
    distribution" to predict the probability of each sample, given its
    frequency in the "base frequency distribution".

    In particular, the heldout estimate approximates the probability
    for a sample that occurs *r* times in the base distribution as
    the average frequency in the heldout distribution of all samples
    that occur *r* times in the base distribution.

    This average frequency is *Tr[r]/(Nr[r].N)*, where:

    - *Tr[r]* is the total count in the heldout distribution for
      all samples that occur *r* times in the base distribution.
    - *Nr[r]* is the number of samples that occur *r* times in
      the base distribution.
    - *N* is the number of outcomes recorded by the heldout
      frequency distribution.

    In order to increase the efficiency of the ``prob`` member
    function, *Tr[r]/(Nr[r].N)* is precomputed for each value of *r*
    when the ``HeldoutProbDist`` is created.

    :type _estimate: list(float)
    :ivar _estimate: A list mapping from *r*, the number of
        times that a sample occurs in the base distribution, to the
        probability estimate for that sample.  ``_estimate[r]`` is
        calculated by finding the average frequency in the heldout
        distribution of all samples that occur *r* times in the base
        distribution.  In particular, ``_estimate[r]`` =
        *Tr[r]/(Nr[r].N)*.
    :type _max_r: int
    :ivar _max_r: The maximum number of times that any sample occurs
        in the base distribution.  ``_max_r`` is used to decide how
        large ``_estimate`` must be.
    """
    SUM_TO_ONE = False
    def __init__(self, base_fdist, heldout_fdist, bins=None):
        """
        Use the heldout estimate to create a probability distribution
        for the experiment used to generate ``base_fdist`` and
        ``heldout_fdist``.

        :type base_fdist: FreqDist
        :param base_fdist: The base frequency distribution.
        :type heldout_fdist: FreqDist
        :param heldout_fdist: The heldout frequency distribution.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """

        self._base_fdist = base_fdist
        self._heldout_fdist = heldout_fdist

        # The max number of times any sample occurs in base_fdist.
        self._max_r = base_fdist[base_fdist.max()]

        # Calculate Tr, Nr, and N.
        Tr = self._calculate_Tr()
        r_Nr = base_fdist.r_Nr(bins)
        Nr = [r_Nr[r] for r in range(self._max_r+1)]
        N = heldout_fdist.N()

        # Use Tr, Nr, and N to compute the probability estimate for
        # each value of r.
        self._estimate = self._calculate_estimate(Tr, Nr, N)

    def _calculate_Tr(self):
        """
        Return the list *Tr*, where *Tr[r]* is the total count in
        ``heldout_fdist`` for all samples that occur *r*
        times in ``base_fdist``.

        :rtype: list(float)
        """
        Tr = [0.0] * (self._max_r+1)
        for sample in self._heldout_fdist:
            r = self._base_fdist[sample]
            Tr[r] += self._heldout_fdist[sample]
        return Tr

    def _calculate_estimate(self, Tr, Nr, N):
        """
        Return the list *estimate*, where *estimate[r]* is the probability
        estimate for any sample that occurs *r* times in the base frequency
        distribution.  In particular, *estimate[r]* is *Tr[r]/(N[r].N)*.
        In the special case that *N[r]=0*, *estimate[r]* will never be used;
        so we define *estimate[r]=None* for those cases.

        :rtype: list(float)
        :type Tr: list(float)
        :param Tr: the list *Tr*, where *Tr[r]* is the total count in
            the heldout distribution for all samples that occur *r*
            times in base distribution.
        :type Nr: list(float)
        :param Nr: The list *Nr*, where *Nr[r]* is the number of
            samples that occur *r* times in the base distribution.
        :type N: int
        :param N: The total number of outcomes recorded by the heldout
            frequency distribution.
        """
        estimate = []
        for r in range(self._max_r+1):
            if Nr[r] == 0: estimate.append(None)
            else: estimate.append(Tr[r]/(Nr[r]*N))
        return estimate

    def base_fdist(self):
        """
        Return the base frequency distribution that this probability
        distribution is based on.

        :rtype: FreqDist
        """
        return self._base_fdist

    def heldout_fdist(self):
        """
        Return the heldout frequency distribution that this
        probability distribution is based on.

        :rtype: FreqDist
        """
        return self._heldout_fdist

    def samples(self):
        return self._base_fdist.keys()

    def prob(self, sample):
        # Use our precomputed probability estimate.
        r = self._base_fdist[sample]
        return self._estimate[r]

    def max(self):
        # Note: the Heldout estimation is *not* necessarily monotonic;
        # so this implementation is currently broken.  However, it
        # should give the right answer *most* of the time. :)
        return self._base_fdist.max()

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        """
        :rtype: str
        :return: A string representation of this ``ProbDist``.
        """
        s = '<HeldoutProbDist: %d base samples; %d heldout samples>'
        return s % (self._base_fdist.N(), self._heldout_fdist.N())


class CrossValidationProbDist(ProbDistI):
    """
    The cross-validation estimate for the probability distribution of
    the experiment used to generate a set of frequency distribution.
    The "cross-validation estimate" for the probability of a sample
    is found by averaging the held-out estimates for the sample in
    each pair of frequency distributions.
    """
    SUM_TO_ONE = False
    def __init__(self, freqdists, bins):
        """
        Use the cross-validation estimate to create a probability
        distribution for the experiment used to generate
        ``freqdists``.

        :type freqdists: list(FreqDist)
        :param freqdists: A list of the frequency distributions
            generated by the experiment.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        self._freqdists = freqdists

        # Create a heldout probability distribution for each pair of
        # frequency distributions in freqdists.
        self._heldout_probdists = []
        for fdist1 in freqdists:
            for fdist2 in freqdists:
                if fdist1 is not fdist2:
                    probdist = HeldoutProbDist(fdist1, fdist2, bins)
                    self._heldout_probdists.append(probdist)

    def freqdists(self):
        """
        Return the list of frequency distributions that this ``ProbDist`` is based on.

        :rtype: list(FreqDist)
        """
        return self._freqdists

    def samples(self):
        # [xx] nb: this is not too efficient
        return set(sum([list(fd) for fd in self._freqdists], []))

    def prob(self, sample):
        # Find the average probability estimate returned by each
        # heldout distribution.
        prob = 0.0
        for heldout_probdist in self._heldout_probdists:
            prob += heldout_probdist.prob(sample)
        return prob/len(self._heldout_probdists)

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<CrossValidationProbDist: %d-way>' % len(self._freqdists)


class WittenBellProbDist(ProbDistI):
    """
    The Witten-Bell estimate of a probability distribution. This distribution
    allocates uniform probability mass to as yet unseen events by using the
    number of events that have only been seen once. The probability mass
    reserved for unseen events is equal to *T / (N + T)*
    where *T* is the number of observed event types and *N* is the total
    number of observed events. This equates to the maximum likelihood estimate
    of a new type event occurring. The remaining probability mass is discounted
    such that all probability estimates sum to one, yielding:

        - *p = T / Z (N + T)*, if count = 0
        - *p = c / (N + T)*, otherwise
    """

    def __init__(self, freqdist, bins=None):
        """
        Creates a distribution of Witten-Bell probability estimates.  This
        distribution allocates uniform probability mass to as yet unseen
        events by using the number of events that have only been seen once. The
        probability mass reserved for unseen events is equal to *T / (N + T)*
        where *T* is the number of observed event types and *N* is the total
        number of observed events. This equates to the maximum likelihood
        estimate of a new type event occurring. The remaining probability mass
        is discounted such that all probability estimates sum to one,
        yielding:

            - *p = T / Z (N + T)*, if count = 0
            - *p = c / (N + T)*, otherwise

        The parameters *T* and *N* are taken from the ``freqdist`` parameter
        (the ``B()`` and ``N()`` values). The normalizing factor *Z* is
        calculated using these values along with the ``bins`` parameter.

        :param freqdist: The frequency counts upon which to base the
            estimation.
        :type freqdist: FreqDist
        :param bins: The number of possible event types. This must be at least
            as large as the number of bins in the ``freqdist``. If None, then
            it's assumed to be equal to that of the ``freqdist``
        :type bins: int
        """
        assert bins is None or bins >= freqdist.B(),\
               'bins parameter must not be less than %d=freqdist.B()' % freqdist.B()
        if bins is None:
            bins = freqdist.B()
        self._freqdist = freqdist
        self._T = self._freqdist.B()
        self._Z = bins - self._freqdist.B()
        self._N = self._freqdist.N()
        # self._P0 is P(0), precalculated for efficiency:
        if self._N==0:
            # if freqdist is empty, we approximate P(0) by a UniformProbDist:
            self._P0 = 1.0 / self._Z
        else:
            self._P0 = self._T / (self._Z * (self._N + self._T))

    def prob(self, sample):
        # inherit docs from ProbDistI
        c = self._freqdist[sample]
        return (c / (self._N + self._T) if c != 0 else self._P0)

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def freqdist(self):
        return self._freqdist

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<WittenBellProbDist based on %d samples>' % self._freqdist.N()


class SimpleGoodTuringProbDist(ProbDistI):
    """
    SimpleGoodTuring ProbDist approximates from frequency to frequency of
    frequency into a linear line under log space by linear regression.
    Details of Simple Good-Turing algorithm can be found in:

    - Good Turing smoothing without tears" (Gale & Sampson 1995),
      Journal of Quantitative Linguistics, vol. 2 pp. 217-237.
    - "Speech and Language Processing (Jurafsky & Martin),
      2nd Edition, Chapter 4.5 p103 (log(Nc) =  a + b*log(c))
    - http://www.grsampson.net/RGoodTur.html

    Given a set of pair (xi, yi),  where the xi denotes the frequency and
    yi denotes the frequency of frequency, we want to minimize their
    square variation. E(x) and E(y) represent the mean of xi and yi.

    - slope: b = sigma ((xi-E(x)(yi-E(y))) / sigma ((xi-E(x))(xi-E(x)))
    - intercept: a = E(y) - b.E(x)
    """
    SUM_TO_ONE = False
    def __init__(self, freqdist, bins=None):
        """
        :param freqdist: The frequency counts upon which to base the
            estimation.
        :type freqdist: FreqDist
        :param bins: The number of possible event types. This must be
            larger than the number of bins in the ``freqdist``. If None,
            then it's assumed to be equal to ``freqdist``.B() + 1
        :type bins: int
        """
        assert bins is None or bins > freqdist.B(),\
               'bins parameter must not be less than %d=freqdist.B()+1' % (freqdist.B()+1)
        if bins is None:
            bins = freqdist.B() + 1
        self._freqdist = freqdist
        self._bins = bins
        r, nr = self._r_Nr()
        self.find_best_fit(r, nr)
        self._switch(r, nr)
        self._renormalize(r, nr)

    def _r_Nr_non_zero(self):
        r_Nr = self._freqdist.r_Nr()
        del r_Nr[0]
        return r_Nr

    def _r_Nr(self):
        """
        Split the frequency distribution in two list (r, Nr), where Nr(r) > 0
        """
        nonzero = self._r_Nr_non_zero()

        if not nonzero:
            return [], []
        return zip(*sorted(nonzero.items()))

    def find_best_fit(self, r, nr):
        """
        Use simple linear regression to tune parameters self._slope and
        self._intercept in the log-log space based on count and Nr(count)
        (Work in log space to avoid floating point underflow.)
        """
        # For higher sample frequencies the data points becomes horizontal
        # along line Nr=1. To create a more evident linear model in log-log
        # space, we average positive Nr values with the surrounding zero
        # values. (Church and Gale, 1991)

        if not r or not nr:
            # Empty r or nr?
            return

        zr = []
        for j in range(len(r)):
            i = (r[j-1] if j > 0 else 0)
            k = (2 * r[j] - i if j == len(r) - 1 else r[j+1])
            zr_ = 2.0 * nr[j] / (k - i)
            zr.append(zr_)

        log_r = [math.log(i) for i in r]
        log_zr = [math.log(i) for i in zr]

        xy_cov = x_var = 0.0
        x_mean = sum(log_r) / len(log_r)
        y_mean = sum(log_zr) / len(log_zr)
        for (x, y) in zip(log_r, log_zr):
            xy_cov += (x - x_mean) * (y - y_mean)
            x_var += (x - x_mean)**2
        self._slope = (xy_cov / x_var if x_var != 0 else 0.0)
        if self._slope >= -1:
            warnings.warn('SimpleGoodTuring did not find a proper best fit '
                          'line for smoothing probabilities of occurrences. '
                          'The probability estimates are likely to be '
                          'unreliable.')
        self._intercept = y_mean - self._slope * x_mean

    def _switch(self, r, nr):
        """
        Calculate the r frontier where we must switch from Nr to Sr
        when estimating E[Nr].
        """
        for i, r_ in enumerate(r):
            if len(r) == i + 1 or r[i+1] != r_ + 1:
                # We are at the end of r, or there is a gap in r
                self._switch_at = r_
                break

            Sr = self.smoothedNr
            smooth_r_star = (r_ + 1) * Sr(r_+1) / Sr(r_)
            unsmooth_r_star = (r_ + 1) * nr[i+1] / nr[i]

            std = math.sqrt(self._variance(r_, nr[i], nr[i+1]))
            if abs(unsmooth_r_star-smooth_r_star) <= 1.96 * std:
                self._switch_at = r_
                break

    def _variance(self, r, nr, nr_1):
        r = float(r)
        nr = float(nr)
        nr_1 = float(nr_1)
        return (r + 1.0)**2 * (nr_1 / nr**2) * (1.0 + nr_1 / nr)

    def _renormalize(self, r, nr):
        """
        It is necessary to renormalize all the probability estimates to
        ensure a proper probability distribution results. This can be done
        by keeping the estimate of the probability mass for unseen items as
        N(1)/N and renormalizing all the estimates for previously seen items
        (as Gale and Sampson (1995) propose). (See M&S P.213, 1999)
        """
        prob_cov = 0.0
        for r_, nr_ in zip(r, nr):
            prob_cov  += nr_ * self._prob_measure(r_)
        if prob_cov:
            self._renormal = (1 - self._prob_measure(0)) / prob_cov

    def smoothedNr(self, r):
        """
        Return the number of samples with count r.

        :param r: The amount of frequency.
        :type r: int
        :rtype: float
        """

        # Nr = a*r^b (with b < -1 to give the appropriate hyperbolic
        # relationship)
        # Estimate a and b by simple linear regression technique on
        # the logarithmic form of the equation: log Nr = a + b*log(r)

        return math.exp(self._intercept + self._slope * math.log(r))

    def prob(self, sample):
        """
        Return the sample's probability.

        :param sample: sample of the event
        :type sample: str
        :rtype: float
        """
        count = self._freqdist[sample]
        p = self._prob_measure(count)
        if count == 0:
            if self._bins == self._freqdist.B():
                p = 0.0
            else:
                p = p / (self._bins - self._freqdist.B())
        else:
            p = p * self._renormal
        return p

    def _prob_measure(self, count):
        if count == 0 and self._freqdist.N() == 0 :
            return 1.0
        elif count == 0 and self._freqdist.N() != 0:
            return self._freqdist.Nr(1) / self._freqdist.N()

        if self._switch_at > count:
            Er_1 = self._freqdist.Nr(count+1)
            Er = self._freqdist.Nr(count)
        else:
            Er_1 = self.smoothedNr(count+1)
            Er = self.smoothedNr(count)

        r_star = (count + 1) * Er_1 / Er
        return r_star / self._freqdist.N()

    def check(self):
        prob_sum = 0.0
        for i in  range(0, len(self._Nr)):
            prob_sum += self._Nr[i] * self._prob_measure(i) / self._renormal
        print("Probability Sum:", prob_sum)
        #assert prob_sum != 1.0, "probability sum should be one!"

    def discount(self):
        """
        This function returns the total mass of probability transfers from the
        seen samples to the unseen samples.
        """
        return  self.smoothedNr(1) / self._freqdist.N()

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def freqdist(self):
        return self._freqdist

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<SimpleGoodTuringProbDist based on %d samples>'\
                % self._freqdist.N()


class MutableProbDist(ProbDistI):
    """
    An mutable probdist where the probabilities may be easily modified. This
    simply copies an existing probdist, storing the probability values in a
    mutable dictionary and providing an update method.
    """

    def __init__(self, prob_dist, samples, store_logs=True):
        """
        Creates the mutable probdist based on the given prob_dist and using
        the list of samples given. These values are stored as log
        probabilities if the store_logs flag is set.

        :param prob_dist: the distribution from which to garner the
            probabilities
        :type prob_dist: ProbDist
        :param samples: the complete set of samples
        :type samples: sequence of any
        :param store_logs: whether to store the probabilities as logarithms
        :type store_logs: bool
        """
        self._samples = samples
        self._sample_dict = dict((samples[i], i) for i in range(len(samples)))
        self._data = array.array(str("d"), [0.0]) * len(samples)
        for i in range(len(samples)):
            if store_logs:
                self._data[i] = prob_dist.logprob(samples[i])
            else:
                self._data[i] = prob_dist.prob(samples[i])
        self._logs = store_logs

    def samples(self):
        # inherit documentation
        return self._samples

    def prob(self, sample):
        # inherit documentation
        i = self._sample_dict.get(sample)
        if i is None:
            return 0.0
        return (2**(self._data[i]) if self._logs else self._data[i])

    def logprob(self, sample):
        # inherit documentation
        i = self._sample_dict.get(sample)
        if i is None:
            return float('-inf')
        return (self._data[i] if self._logs else math.log(self._data[i], 2))

    def update(self, sample, prob, log=True):
        """
        Update the probability for the given sample. This may cause the object
        to stop being the valid probability distribution - the user must
        ensure that they update the sample probabilities such that all samples
        have probabilities between 0 and 1 and that all probabilities sum to
        one.

        :param sample: the sample for which to update the probability
        :type sample: any
        :param prob: the new probability
        :type prob: float
        :param log: is the probability already logged
        :type log: bool
        """
        i = self._sample_dict.get(sample)
        assert i is not None
        if self._logs:
            self._data[i] = (prob if log else math.log(prob, 2))
        else:
            self._data[i] = (2**(prob) if log else prob)


class KneserNeyProbDist(ProbDistI):
    """
    Kneser-Ney estimate of a probability distribution. This is a version of
    back-off that counts how likely an n-gram is provided the n-1-gram had
    been seen in training. Extends the ProbDistI interface, requires a trigram
    FreqDist instance to train on. Optionally, a different from default discount
    value can be specified. The default discount is set to 0.75.

    """
    def __init__(self, freqdist, bins=None, discount=0.75):
        """
        :param freqdist: The trigram frequency distribution upon which to base
            the estimation
        :type freqdist: FreqDist
        :param bins: Included for compatibility with nltk.tag.hmm
        :type bins: int or float
        :param discount: The discount applied when retrieving counts of
            trigrams
        :type discount: float (preferred, but can be set to int)
        """

        if not bins:
            self._bins = freqdist.B()
        else:
            self._bins = bins
        self._D = discount

        # cache for probability calculation
        self._cache = {}

        # internal bigram and trigram frequency distributions
        self._bigrams = defaultdict(int)
        self._trigrams = freqdist

        # helper dictionaries used to calculate probabilities
        self._wordtypes_after = defaultdict(float)
        self._trigrams_contain = defaultdict(float)
        self._wordtypes_before = defaultdict(float)
        for w0, w1, w2 in freqdist:
            self._bigrams[(w0,w1)] += freqdist[(w0, w1, w2)]
            self._wordtypes_after[(w0,w1)] += 1
            self._trigrams_contain[w1] += 1
            self._wordtypes_before[(w1,w2)] += 1

    def prob(self, trigram):
        # sample must be a triple
        if len(trigram) != 3:
            raise ValueError('Expected an iterable with 3 members.')
        trigram = tuple(trigram)
        w0, w1, w2 = trigram

        if trigram in self._cache:
            return self._cache[trigram]
        else:
            # if the sample trigram was seen during training
            if trigram in self._trigrams:
                prob = (self._trigrams[trigram]
                        - self.discount())/self._bigrams[(w0, w1)]

            # else if the 'rougher' environment was seen during training
            elif (w0,w1) in self._bigrams and (w1,w2) in self._wordtypes_before:
                aftr = self._wordtypes_after[(w0, w1)]
                bfr = self._wordtypes_before[(w1, w2)]

                # the probability left over from alphas
                leftover_prob = ((aftr * self.discount())
                                 / self._bigrams[(w0, w1)])

                # the beta (including normalization)
                beta = bfr /(self._trigrams_contain[w1] - aftr)

                prob = leftover_prob * beta

            # else the sample was completely unseen during training
            else:
                prob = 0.0

            self._cache[trigram] = prob
            return prob

    def discount(self):
        """
        Return the value by which counts are discounted. By default set to 0.75.

        :rtype: float
        """
        return self._D

    def set_discount(self, discount):
        """
        Set the value by which counts are discounted to the value of discount.

        :param discount: the new value to discount counts by
        :type discount: float (preferred, but int possible)
        :rtype: None
        """
        self._D = discount

    def samples(self):
        return self._trigrams.keys()

    def max(self):
        return self._trigrams.max()

    def __repr__(self):
        '''
        Return a string representation of this ProbDist

        :rtype: str
        '''
        return '<KneserNeyProbDist based on {0} trigrams'.format(self._trigrams.N())