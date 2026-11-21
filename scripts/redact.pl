my $KW = 'token|secret|password|passwd|api_?key|jwt|private_?key';
my $R  = '[REDACTED]';
sub redact {
  my ($t, $keep_nl) = @_;
  # PEM private key blocks (an unterminated block is redacted to end of input)
  $t =~ s{(-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\z))}
         { my $m = $1; $R . ($keep_nl ? "\n" x ($m =~ tr/\n//) : "") }gse;
  $t =~ s/sk-ant-[A-Za-z0-9_\-]{8,}/$R/g;
  $t =~ s/sk-[A-Za-z0-9_\-]{16,}/$R/g;
  $t =~ s/\bgh[pousr]_[A-Za-z0-9]{20,}/$R/g;
  $t =~ s/github_pat_[A-Za-z0-9_]{20,}/$R/g;
  $t =~ s/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/$R/g;
  $t =~ s/xox[bpaers]-[A-Za-z0-9\-]{10,}/$R/g;
  $t =~ s/\beyJ[A-Za-z0-9_\-]{5,}\.eyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]*/$R/g;
  $t =~ s/\b(Bearer[ \t]+)[A-Za-z0-9._~+\/=\-]{8,}/$1$R/gi;
  # "key": "value" where key contains a sensitive word
  $t =~ s/("[^"\n]*(?:$KW)[^"\n]*"[ \t]*:[ \t]*")(?![\^~]?\d+\.\d+\.\d+)[^"\n]*(")/$1$R$2/gi;
  # key=value / key: value (unquoted values must look like literals: 6+ chars with a digit, so code identifiers pass)
  $t =~ s/(\b[\w.\-]*(?:$KW)[\w.\-]*[ \t]*[=:][ \t]*)("[^"\n]*"|'[^'\n]*'|(?=[^\s"',;]*\d)[^\s"',;]{6,})/$1$R/gi;
  return $t;
}
my $mode = shift @ARGV;
my $text = do { local $/; <> }; $text = '' unless defined $text;
if ($mode eq 'report') {
  my @o = split /\n/, $text, -1;
  my @n = split /\n/, redact($text, 1), -1;
  for my $i (0 .. $#o) {
    next if ($o[$i] // '') eq ($n[$i] // '');
    print(($i + 1) . ": " . ($n[$i] // '') . "\n");
  }
} else { print redact($text, 0); }
