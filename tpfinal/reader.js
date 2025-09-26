class MediaMTXWebRTCReader {
  /**
   * Create a MediaMTXWebRTCReader.
   * @param {Conf} conf - configuration.
   */
  constructor(conf) {
    this.retryPause = 2000;
    this.conf = conf;
    this.state = 'getting_codecs';
    this.restartTimeout = null;
    this.pc = null;
    this.offerData = null;
    this.sessionUrl = null;
    this.queuedCandidates = [];
    this.#getNonAdvertisedCodecs();
  }

  /**
   * Close the reader and all its resources.
   */
  close() {
    this.state = 'closed';

    if (this.pc !== null) {
      this.pc.close();
    }

    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
    }
  }

  static #supportsNonAdvertisedCodec(codec, fmtp) {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const mediaType = 'audio';
      let payloadType = '';

      pc.addTransceiver(mediaType, { direction: 'recvonly' });
      pc.createOffer()
        .then((offer) => {
          if (offer.sdp === undefined) {
            throw new Error('SDP not present');
          }
          if (offer.sdp.includes(` ${codec}`)) { // codec is advertised, there's no need to add it manually
            throw new Error('already present');
          }

          const sections = offer.sdp.split(`m=${mediaType}`);

          const payloadTypes = sections.slice(1)
            .map((s) => s.split('\r\n')[0].split(' ').slice(3))
            .reduce((prev, cur) => [...prev, ...cur], []);
          payloadType = this.#reservePayloadType(payloadTypes);

          const lines = sections[1].split('\r\n');
          lines[0] += ` ${payloadType}`;
          lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} ${codec}`);
          if (fmtp !== undefined) {
            lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} ${fmtp}`);
          }
          sections[1] = lines.join('\r\n');
          offer.sdp = sections.join(`m=${mediaType}`);
          return pc.setLocalDescription(offer);
        })
        .then(() => (
          pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: 'v=0\r\n'
            + 'o=- 6539324223450680508 0 IN IP4 0.0.0.0\r\n'
            + 's=-\r\n'
            + 't=0 0\r\n'
            + 'a=fingerprint:sha-256 0D:9F:78:15:42:B5:4B:E6:E2:94:3E:5B:37:78:E1:4B:54:59:A3:36:3A:E5:05:EB:27:EE:8F:D2:2D:41:29:25\r\n'
            + `m=${mediaType} 9 UDP/TLS/RTP/SAVPF ${payloadType}\r\n`
            + 'c=IN IP4 0.0.0.0\r\n'
            + 'a=ice-pwd:7c3bf4770007e7432ee4ea4d697db675\r\n'
            + 'a=ice-ufrag:29e036dc\r\n'
            + 'a=sendonly\r\n'
            + 'a=rtcp-mux\r\n'
            + `a=rtpmap:${payloadType} ${codec}\r\n`
            + ((fmtp !== undefined) ? `a=fmtp:${payloadType} ${fmtp}\r\n` : ''),
          }))
        ))
        .then(() => {
          resolve(true);
        })
        .catch(() => {
          resolve(false);
        })
        .finally(() => {
          pc.close();
        });
    });
  }

  static #unquoteCredential(v) {
    return JSON.parse(`"${v}"`);
  }

  static #linkToIceServers(links) {
    return (links !== null) ? links.split(', ').map((link) => {
      const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i);
      const ret = {
        urls: [m[1]],
      };

      if (m[3] !== undefined) {
        ret.username = this.#unquoteCredential(m[3]);
        ret.credential = this.#unquoteCredential(m[4]);
        ret.credentialType = 'password';
      }

      return ret;
    }) : [];
  }

  static #parseOffer(sdp) {
    const ret = {
      iceUfrag: '',
      icePwd: '',
      medias: [],
    };

    for (const line of sdp.split('\r\n')) {
      if (line.startsWith('m=')) {
        ret.medias.push(line.slice('m='.length));
      } else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
        ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
      } else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
        ret.icePwd = line.slice('a=ice-pwd:'.length);
      }
    }

    return ret;
  }

  static #reservePayloadType(payloadTypes) {
    // everything is valid between 30 and 127, except for interval between 64 and 95
    // https://chromium.googlesource.com/external/webrtc/+/refs/heads/master/call/payload_type.h#29
    for (let i = 30; i <= 127; i++) {
      if ((i <= 63 || i >= 96) && !payloadTypes.includes(i.toString())) {
        const pl = i.toString();
        payloadTypes.push(pl);
        return pl;
      }
    }
    throw Error('unable to find a free payload type');
  }

  static #enableStereoPcmau(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMU/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMA/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableMultichannelOpus(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/3`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,2,1;num_streams=2;coupled_streams=1`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/4`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,1,2,3;num_streams=2;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/5`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3;num_streams=3;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/6`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/7`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3,5,6;num_streams=4;coupled_streams=4`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/8`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,6,1,4,5,2,3,7;num_streams=5;coupled_streams=4`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableL16(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/16000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/48000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableStereoOpus(section) {
    let opusPayloadFormat = '';
    const lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
        opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
        break;
      }
    }

    if (opusPayloadFormat === '') {
      return section;
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`a=fmtp:${opusPayloadFormat} `)) {
        if (!lines[i].includes('stereo')) {
          lines[i] += ';stereo=1';
        }
        if (!lines[i].includes('sprop-stereo')) {
          lines[i] += ';sprop-stereo=1';
        }
      }
    }

    return lines.join('\r\n');
  }

  static #editOffer(sdp, nonAdvertisedCodecs) {
    const sections = sdp.split('m=');

    const payloadTypes = sections.slice(1)
      .map((s) => s.split('\r\n')[0].split(' ').slice(3))
      .reduce((prev, cur) => [...prev, ...cur], []);

    for (let i = 1; i < sections.length; i++) {
      if (sections[i].startsWith('audio')) {
        sections[i] = this.#enableStereoOpus(sections[i]);

        if (nonAdvertisedCodecs.includes('pcma/8000/2')) {
          sections[i] = this.#enableStereoPcmau(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes('multiopus/48000/6')) {
          sections[i] = this.#enableMultichannelOpus(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes('L16/48000/2')) {
          sections[i] = this.#enableL16(payloadTypes, sections[i]);
        }

        break;
      }
    }

    return sections.join('m=');
  }

  static #generateSdpFragment(od, candidates) {
    const candidatesByMedia = {};
    for (const candidate of candidates) {
      const mid = candidate.sdpMLineIndex;
      if (candidatesByMedia[mid] === undefined) {
        candidatesByMedia[mid] = [];
      }
      candidatesByMedia[mid].push(candidate);
    }

    let frag = `a=ice-ufrag:${od.iceUfrag}\r\n`
      + `a=ice-pwd:${od.icePwd}\r\n`;

    let mid = 0;

    for (const media of od.medias) {
      if (candidatesByMedia[mid] !== undefined) {
        frag += `m=${media}\r\n`
          + `a=mid:${mid}\r\n`;

        for (const candidate of candidatesByMedia[mid]) {
          frag += `a=${candidate.candidate}\r\n`;
        }
      }
      mid++;
    }

    return frag;
  }

  #handleError(err) {
    if (this.state === 'running') {
      if (this.pc !== null) {
        this.pc.close();
        this.pc = null;
      }

      this.offerData = null;

      if (this.sessionUrl !== null) {
        fetch(this.sessionUrl, {
          method: 'DELETE',
        });
        this.sessionUrl = null;
      }

      this.queuedCandidates = [];
      this.state = 'restarting';

      this.restartTimeout = window.setTimeout(() => {
        this.restartTimeout = null;
        this.state = 'running';
        this.#start();
      }, this.retryPause);

      if (this.conf.onError !== undefined) {
        this.conf.onError(`${err}, retrying in some seconds`);
      }
    } else if (this.state === 'getting_codecs') {
      this.state = 'failed';

      if (this.conf.onError !== undefined) {
        this.conf.onError(err);
      }
    }
  }

  #getNonAdvertisedCodecs() {
    Promise.all([
      ['pcma/8000/2'],
      ['multiopus/48000/6', 'channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2'],
      ['L16/48000/2'],
    ]
      .map((c) => MediaMTXWebRTCReader.#supportsNonAdvertisedCodec(c[0], c[1]).then((r) => ((r) ? c[0] : false))))
      .then((c) => c.filter((e) => e !== false))
      .then((codecs) => {
        if (this.state !== 'getting_codecs') {
          throw new Error('closed');
        }

        this.nonAdvertisedCodecs = codecs;
        this.state = 'running';
        this.#start();
      })
      .catch((err) => {
        this.#handleError(err);
      });
  }

  #start() {
    this.#requestICEServers()
      .then((iceServers) => this.#setupPeerConnection(iceServers))
      .then((offer) => this.#sendOffer(offer))
      .then((answer) => this.#setAnswer(answer))
      .catch((err) => {
        this.#handleError(err.toString());
      });
  }

  #requestICEServers() {
    return fetch(this.conf.url, {
      method: 'OPTIONS',
    })
      .then((res) => MediaMTXWebRTCReader.#linkToIceServers(res.headers.get('Link')));
  }

  #setupPeerConnection(iceServers) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    this.pc = new RTCPeerConnection({
      iceServers,
      // https://webrtc.org/getting-started/unified-plan-transition-guide
      sdpSemantics: 'unified-plan',
    });

    const direction = 'recvonly';
    this.pc.addTransceiver('video', { direction });
    this.pc.addTransceiver('audio', { direction });

    this.pc.onicecandidate = (evt) => this.#onLocalCandidate(evt);
    this.pc.onconnectionstatechange = () => this.#onConnectionState();
    this.pc.ontrack = (evt) => this.#onTrack(evt);

    return this.pc.createOffer()
      .then((offer) => {
        offer.sdp = MediaMTXWebRTCReader.#editOffer(offer.sdp, this.nonAdvertisedCodecs);
        this.offerData = MediaMTXWebRTCReader.#parseOffer(offer.sdp);

        return this.pc.setLocalDescription(offer)
          .then(() => offer.sdp);
      });
  }

  #sendOffer(offer) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    return fetch(this.conf.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/sdp'},
      body: offer,
    })
      .then((res) => {
        switch (res.status) {
          case 201:
            break;
          case 404:
            throw new Error('stream not found');
          case 400:
            return res.json().then((e) => { throw new Error(e.error); });
          default:
            throw new Error(`bad status code ${res.status}`);
        }

        this.sessionUrl = new URL(res.headers.get('location'), this.conf.url).toString();

        return res.text();
      });
  }

  #setAnswer(answer) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    return this.pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answer,
    }))
      .then(() => {
        if (this.state !== 'running') {
          return;
        }

        if (this.queuedCandidates.length !== 0) {
          this.#sendLocalCandidates(this.queuedCandidates);
          this.queuedCandidates = [];
        }
      });
  }

  #onLocalCandidate(evt) {
    if (this.state !== 'running') {
      return;
    }

    if (evt.candidate !== null) {
      if (this.sessionUrl === null) {
        this.queuedCandidates.push(evt.candidate);
      } else {
        this.#sendLocalCandidates([evt.candidate]);
      }
    }
  }

  #sendLocalCandidates(candidates) {
    fetch(this.sessionUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/trickle-ice-sdpfrag',
        'If-Match': '*',
      },
      body: MediaMTXWebRTCReader.#generateSdpFragment(this.offerData, candidates),
    })
      .then((res) => {
        switch (res.status) {
          case 204:
            break;
          case 404:
            throw new Error('stream not found');
          default:
            throw new Error(`bad status code ${res.status}`);
        }
      })
      .catch((err) => {
        this.#handleError(err.toString());
      });
  }

  #onConnectionState() {
    if (this.state !== 'running') {
      return;
    }

    // "closed" can arrive before "failed" and without
    // the close() method being called at all.
    // It happens when the other peer sends a termination
    // message like a DTLS CloseNotify.
    if (this.pc.connectionState === 'failed'
      || this.pc.connectionState === 'closed'
    ) {
      this.#handleError('peer connection closed');
    }
  }

  #onTrack(evt) {
    if (this.conf.onTrack !== undefined) {
      this.conf.onTrack(evt);
    }
  }
}

window.MediaMTXWebRTCReader = MediaMTXWebRTCReader;
            € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € € €   €           € € € € € € € áááááááááááááááááááááááááá€ € € € € €                           € € € € €                                                                                                                                 @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 
             À "   ) 1 :    B I Q  Y a i  à à à à à à à à à à à à à à à à à à à à à à à à q  5 M à à  à =à à y y à =à à }à  à à à à à à à à à à à à à à à à à à à à à à à e à =à à ‰  } à à } }à • ­ =à  Å İ õ à % ==à   U mà à à …}à   à …ıà µÍ=à à åà   à       ‘ ‘ ‘ ı-E]uà ıà à =à à }à à =à  à à à à à à à à à  ¥½à Õíà à à à à à à à à à à à à à à à à à à à  à à à à à à à à à       ™ =à ¡                          Ò Ú â ê ò ú   ­‰ 	Å                           İİ3õ333333333À333333333333333333333333333333333à à % à @ @    "=@ @ @ @ : *UáU-á=á-á@ İ@ m… ááááááááááááááá@                       à            ÅàµÍ½àõàıààµà à à à à à à à à à à à à å…áá ıİ }à Õáà  --                                à à à à à à à à à à à à à à à à à  3333333à à à à à à à à à à à à à à à à à à à à à à à à à à à @ à =à à }à à =à à  à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à @ õõõõõõõõõõõõõõõ@@@@@@       33333333333@





























333333333333333333333 

39AIQ












3333333@ 33333333 3333          



@ @3



















3333333333333333
















333@ @ @ 





@ @ @ @ @ 





@ @@@ @ @ @ @ @ 33333333























0333333330000;00 3333333Yaiqy‰‘  33                             300@         @ @   @ @                       @        @  @ @ @     @ @ 3 0003333@ @ 00@ @ 00; @ @ @ @ @ @ @ @ 0@ @ @ @ ™¡@ ©  33@ @                         3@ @ 330@       @ @ @ @   @ @                       @        @  ±@  ¹@   @ @ 3@ 00033@ @ @ @ 33@ @ 33;@ @ @ 3@ @ @ @ @ @ @ ÁÉÑ @ Ù@ @ @ @ @ @ @           33   3 @ @ @ @ @ @ @ @ @ @ 330@          @    @                       @        @   @      @ @ 3 00033333@ 330@ 00;@ @  @ @ @ @ @ @ @ @ @ @ @ @ @ @ @   33@ @             @ @ @ @ @ @ @  333333@ 300@         @ @   @ @                       @        @   @      @ @ 3 0303333@ @ 00@ @ 00;@ @ @ @ @ @ @ 330@ @ @ @ áé@    33@ @                   @ @ @ @ @ @ @ @ @ @ 3 @       @ @ @    @     @ @ @   @  @   @ @ @   @ @ @    @ @ @             @ @ @ @ 0030000@ 333@ 333;@ @ @ @ @ @ @ 33@    @ @  @ @   33@ @           @ @ @ @ @ @ @           300         @    @                        @           @      @ @ 3 0300000@ 300@ 003;@ @ @ @ @ @ @ 00@ @ @ @ @ @   @   33@ @           @   0@ @ @ @ @ @ @ @ @ @ @ @ 03333@ 000@ 000;  @ @ @ @    0          33@ @                           @   @  @      @                         @  @           3 ù333333;33 @ @        @         !    )    1            9   @ @ @ @ 33A3IQYai3333303q33; 33     333333y3333@ 33333333‰3333‘3333™333333333333¡333@                                                áé ñù	© ± !) Q 19¹ AIÁ  QYµéñùaiq	 !yQ ÍÍ9AIµ‰‘å™¡©±¹¹ I‘™¡Á±¹             É                                  ÑÙáéqñù	!ı)1}á9AIQYaiqy‰‘™¡©±¹ÁÉÑà à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à     -M  Ù à à à à à à à à à à à à à à à à       @ @ EàEàEàEàEàEà@ @         @ Eà@ Eà@ Eà@ Eà        EàEàEàEàEàEàEàEà á é ñ ù  	 @ @ !)19AIQ!)19AIQYaiqy‰‘Yaiqy‰‘™¡©±¹ÁÉÑ™¡©±¹ÁÉÑ  Ùáé@  ñEàEàeáá~ù¾	@  !İéõñ*2:   A@ @   EàEàù@ JRZ   a    EàEà%	Màj*r@ @ y‰@  ‘=Vv@ 
 
 
 
 
 
 
 
 
 
 
 À  @@ à     –            @ @ @  @ @ @@@@@
    ™¡ ©±    º ¶        ÂÊÒ             Ù       
 À@@@À@ @ @ @ @ @@@@@@á@ @ éñù	Õ"*2)áI ) 1 éñù	í"*2@  ùQ 	a© !)9‰ A@ @ @         9                       &ÙE f†i ¥	© © © © A )I  9Q¹ ¹ ¹   YÅa ± i ± qéÙ ùùñ@ !Q y‰‘ å™¡¡™	    ññù±       ¡©±¹ÁÉÑÙáéñù	!	)‘1=	9A	I]	Ùñ!!}	)‘1	9A	I½	Ùñ!           @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ I ) 1 éñù	y‰‘™¡©±¹ÁÉ
>
^
~

¾
Ş
ş
ÒÚâêòú	
			"	@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ >^~¾Şş>^~¾Şş>^~¾Şş>^ éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ±á                                                     à A	ÕI	  }à à =à YAQÑ à  à      ± ‘Q	Y	à à à à à à à à à à à à à à à à à à        =à à 333à @ @ @ @ @        '5'U'u'•'µ'Õ'õ'(5(U(u(•(µ(Õ(õ()5)U)u)•)µ)@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 
  a	                                       333300      %á Õ)õ)*     U+u+•+µ+Õ+õ+õ+õ+,,,,5,5,5,U,u,u,•*•*u,u,•,•,u,u,•*•*u,u,U,U,µ,µ,Õ,Õ,@ õ,-5-5-U-u-•-µ-Õ-õ-.5.U.U.u.•.•.µ.Õ.u.õ./õ.u.5/U/u/•/µ/-õ,Õ/õ/050U0u0•0µ0Õ0õ01@   51U1u1•1µ1Õ1õ1252U2u1u2•2µ2                                ‚Š’šÕ2õ2353        U3¡©±¹ÁÉÑÙáéñù	u3•3µ3Õ3õ3õ3454U4u4•4µ4Õ4õ4555U5u5•5µ5Õ5õ5656U6u6•6µ6!Õ6 õ6757U7u7•7µ7Õ7õ7858U8u8•8µ8Õ8õ8959U9u9•9µ9Õ9õ9:5:U:u:•:µ:Õ:õ:;5;U;u;•;•µ;Õ;õ;<5<U<u<µ#•<µ<)19AIQYaiqy‰‘™¡©±¹ÁÉÑÙáéñùÕ<	õ<=-=E=]=u=u=]==Õ¥=½=Õ=í=>>5>M>e>}>•>­>­>Å>Å>İ>İ>õ>?%?=?U?U?m?m?m?…??µ?Í?µ?å?ı?…?@-@-@-@ù¥@	!)Å@19Aå@å@IQYA%AEAeA…Aaiqy¥A‰‘™ÅAåA¡B%BEB©eB±¹ù…B¥BÅBåBÁÉÑÙCáéñ%Cùù	EC!eC…C@ )19A@ IQYaiq™y‰¥C‘!ÅCåC™@ D¡©±¹ÁÉÑÙáéñù	!)19AIQYaiqy‰‘™¡©±¹Á%Dà à à à à à à à à à à à à à à à à à à à à à à  3333 3333333333  à à à à à à à à à à à à à à ÑÉ33                                                                  à à à à à à à   à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à à ıà        à =à EDà à à à à    =à 	  à à   à à à à à à à à à à ÑqÙ! áé)eDà à à à à à à à õy}D}à à @ @ @ @ @ à @  @  à à @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ ÙñQà  Añ      e-eMemee­eÍeíef-fMfmff­f  Íf íf  g-gMgmgg­gÍgígh-h Mh mh  h­h   Íhíhi-iMimii­iÍiíij-jMjmjj­jÍjíjk-kMkmkÍzíz{-{M{m{{­{Í{í{|-|M|m||	­|Í|í|!)1}-}@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 9AIM}m}QQ@ @ @ @ @ @ @ @ @ @ @ @ Yaiqy@ @ @ @ @ 3‰‘y‘™¡©±¹ÁÉÑÙáéñù	!)@ 19AIQ@ Y@ ai@ qy@ ‰‘™¡©±¹ÁÉÑÑÙÙÙÙááááééééññññùùùù				!!!!))))111199AAIIQQYYaaiiiiqqqqyyyy‰‰‘‘‘‘™™¡¡¡¡©©©©±±¹¹@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ ÁÁÁÁÉÉÑÑÙÙIááééññùùùù		!!))11999AAAIIIIIQYaiqy‰‘™¡©±¹ÁÉÑÙáéñù	!)1:BJRZbiqayAi‰‰‘‘™™¡¹©ÁÉ±¹ÙÁáéÑÙñù!)19YaiÉ‰ÑÙ¹áÁÉ1éñ	ùQYa	qy‰¡©±¹Ùñù	!)19AI!QYaiqy‰‘™¡©±¹ÁÉáé	!)AIQY)qy‰¡©±¹1ÑÙ9ñù	Aa	‰¹ÙIAQYa!)Y¹1	Aiqy‰‘™¡©±¹ÁÉÑÙáéñù	!)1Y9AIQ‰‘™¡©±¹ÁÉÑÙáéñù	!)1Y9AIQ!)1YQa)19!)1‰YY                  aiiqy‰‘™™¡©±¹ÁÉÉÑÙÙááéññù		!!)19AAIQYaiiqy)199éAI@ @ @ @ @ @ @  @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ QYaiqy‰‘™¢ª±   À3À3À3À3À3À3À3À3À3À3À3À3À3À3À3À3º}@ Â"ÊÒ­}Í}@ @ @ @ @ @ @ 3333333333333333@ í}~ÚÚ*2âê-~M~m~-~~­~~Í~í~í~-  òúNn®ÚÚÚºÍ@ @ "ÂÒÊí*2âêÍ~- 
   " * "@ 2 : B J @ @ @ @ €Q .€N€@ n€Y €a ®€i Î€q î€y  ‰ ‰ ‘ ‘ ™ ™ ¡ ¡ © © © © ± ± ¹ ¹ ¹ ¹ Á Á É É É É Ñ Ñ Ñ Ñ Ù Ù Ù Ù á á á á é é é é ñ ñ ù ù !!	!	!!!!!!!!!!!!!!!!!)!)!)!)!1!1!1!1!9!9!9!9!A!A!A!A!I!I!I!I!Q!Q!Q!Q!Y!Y!Y!Y!a!a!a!a!i!i!i!i!q!q!q!q!y!y!y!y!!!!!‰!‰!‘!‘!‘!‘!™!™!¡!¡!©!©!±!±!@ @ À@ Êº! : B 
 Â!*2 º a	Ê!áI ) 1 éñù	Â"" "* ÒJ  éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ±ò2 úÒ!Úr éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ±âÚ!êâ!-a	MMm­Íí‚-‚M‚m‚‚­‚Í‚í‚ƒ-ƒMƒmƒƒ­ƒÍƒíƒ„-„M„ím„„M‚­„Í„í„…-…M…m………­……Í…Í…í…í…†M…-†M†-†m†M†††­†­†Í†Í†M†Mí†‡@ -‡M‡m‡‡m‡­‡Í‡í‡í‡ˆˆ-ˆ-ˆˆˆMˆmˆˆ­ˆÍˆíˆíˆíˆ‰‰‰‰í‡í‡í‡@ @ @ M‡-‡-‰-‡M‡-‡@ @ M‰M‡m‰-‰m‰M‡@ @ ‰­‰­ˆm‰-‰m‰@ @ Í‰í‰Í‰@ @ @ é!ñ!ù!Š"	"-Š@ MŠmŠŠmŠ­ŠÍŠíŠ@ @ @ @ @ @ @ @ @ @ @@@@ @ @ @                                     @ @ @ @ @ @ @ @ @ @ @  =‹U‹m‹U‹…‹U‹m‹U‹=‹‹µ‹@ Í‹‹µ‹‹=áMá]áMá}áMá]áMá=áÍáİá@ ıáÍáİáÍá=áMá]á@ }áMá@            @                @        @   @ @ @  ""á!")"@ 1"9"A"I"Q"Y"a"i"q"y""‰"‘"™"A¡"©"±"¹"Á"Ùå‹É"Ñ"ŒÙ"%Œá"é"ñ"Qù"EŒI	#	###!#)#1#9#@ A#I#Q#Y#a#i#q#eŒ…Œ@ @ @ @ @ 




	



	







33@ @ @ @ 



@ @ @ @ @ @ @ @ @ 








@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 

@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 3300@         @ @   @ @                       @        @   @      @ 33 0030000@ @ 00@ @ 008@ @  @ @ @ @ @ @ 0@ @ @ @ @      00@ @ 3333333@ @ @ 33333@ @ @ @ @ @ @ @ @ @ @        @ @  @ @         @   @                         000000@ 00@ @ 338;  éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	@ ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± @ Ùñ@ @ 	@ @ ± @ @ )Q 9Q@ ‰ AI‘Á 	É ± éÙñ@ ñ@ © ± !)@ 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± é@ ñùñ	@ @ ± !)Q 9Q@ ‰ AI‘Á 	É @  éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± é@ ñùñ	@ ± !@ Q @ @ @ ‰ AI‘Á 	É @  éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ± éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ±á#é#@ @ ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁÑA$I$Q$±¹Y$ia$ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁA$A$I$Q$±¹Y$ii$ù#Ñ$±Á™ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁÑA$I$Q$±¹Y$ia$ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁA$A$I$Q$±¹Y$ii$ù#Ñ$±Á™ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁÑA$I$Q$±¹Y$ia$ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁA$A$I$Q$±¹Y$ii$ù#Ñ$±Á™ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁÑA$I$Q$±¹Y$ia$ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁA$A$I$Q$±¹Y$ii$ù#Ñ$±Á™ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁÑA$I$Q$±¹Y$ia$ñ#™¡©ù#$	$Ñù$$!$)$1$9$™ÁA$A$I$Q$±¹Y$ii$ù#Ñ$±Á™q$q$@ @ áI ) 1 éñù	áI ) 1 éñù	áI ) 1 éñù	áI ) 1 éñù	áI ) 1 éñù	3333333@ 33333333333333333@ @ 3333333@ 33@ 33333@ @ @ @ @ y$$©‰$±‘$™$¡$©$±$¹$Á$¹É$Ñ$ÁÉÙ$á$é$ñ$ù$%	%%%!%)%1%9%A%I%Q%y$$©‰$±‘$™$¡$©$±$¹$¹É$ÁÙ$á$é$ñ$ù$%Ñ	%Y%1%a%i%q%y%%@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ áá5á5áááuáuááá5á5áááõáõááá5á5áááuáuááá5á5ááá¥Œ¥Œµµ





























± ¹ Ù ñ @ ‰!	!á 1!‘!a!i!q!y!!A!Q!!!Y!!!É Ñ é ù )!9!I!‰%‰‘%™%@ ¹ Ù @ !@ @ á @ ‘!a!i!q!y!!A!Q!!!Y!@ !É Ñ é @ )!@ I!@ @ @ @ @ @ Ù @ @ @ @ á @ ‘!@ i!@ y!!A!@ !!Y!@ !@ @ é @ )!@ I!@ ‰@ ™%@ ¹ Ù @ !@ @ á 1!‘!a!@ q!y!!A!Q!!!Y!@ !É Ñ é @ )!9!I!‰%@ ‘%@ ± ¹ Ù ñ !‰!	!á 1!‘!@ i!q!y!!A!Q!!!Y!!!É Ñ é ù )!9!I!@ @ @ @ @ ¹ Ù ñ @ ‰!	!á 1!‘!@ i!q!y!!A!Q!!!Y!!!É Ñ é ù )!9!I!@ @ @ @ @ ¢%ª%²%º%Â%Ê%Ò%Ú%â%ê%     ò%ú%&
&&&"&*&2&:&B&J&R&Z&b&j&r&z&‚&Š&’&š&¢&ª&²&º&Á&Ù¹ 9É&  éÙñùñ	© ± !)Q 9Q¹ ‰ AI‘Á 	É ±Ñ&ùÙ&Ùá&é&                          ñ&ù&'                   ''!'@ @ @ @ @ @ @ @ @ @ @ @ @ )'1'9'A'I'Q'Y'a'i'q'y''‰'‘'™'¡'©'±'¹'Á'É'Ñ'Ù'á'é'ñ'ù'(	(((!()(1(9(A(I(Q(Y(a(i(q(y((@ @ @ @ á(é(ñ(½Œù()	)))!)))1)9)İŒA)I)Q)Y)ıŒa)i)™'q)y))‰)‘)=™)¡)©)±)¹)q(Á)É)Ñ)Ù)á)é)ñ)ù)*	***!*)*1*1*1*]9*A*I*}Q*Y*a*i*q*y**‰*‘*™*¡*©*±*±*¹*Á*É*Ñ*Ù*á*é*ñ*ù*+	+++!+)+1+9+A+I+Q+Y+Q'a+i+½İq+y++‰+‘+™+@ ¡+©+©+ı±+¹+Á+É+Ñ+Ù+@ á+é+ñ+ù+,	,=,],!,),1,9,A,I,Q,Y,a,i,}q,y,,‰,‘,™,½İ¡,©,©,±,ı¹,Á,É,Ñ,Ù,á,é,ñ,ù,-	-=--!-)-!-1-9-A-I-Q-Y-a-i-q-y--‰-‘-™-]¡-©-±-¹-Á-}É-Ñ-Ù-á-é-ñ-ù-.	...!.).1.9.A.I.Q.Y.a.i.q.y..‰.‘.™.¡.©.½±.¹.Á.É.Ñ.İÙ.á.é.ñ.ù./	///!/)/ı1/9/A/I/Q/Y/=]a/}i/q/y//‰/‘/™/¡/©/±/¹/Á/É/Ñ/Ù/á/½é/ñ/İıù/0	000!0)01090‘A0=‘I0@ Q0Y0a0]‘i0q0}‘‘y00‰0‘0™0™0¡0©0±0¹0Á0É0Ñ0½‘Ù0İ‘á0ı‘é0’=’]’ñ0ù01}’’½’İ’	1111!1)11191ı’A1I1Q1Y1“a1=“]“i1q1y11‰1‘1}““½“@ ™1İ“¡1©1±1ı“¹1Á1É1Ñ1Ù1”á1é1ñ1ù12	2=”]”2}”2”!2)212½”İ”92ı”A2•I2Q2Y2a2i2q2=•]•}••¡,y22‰2‘2™2¡2©2±2¹2Á2É2½•Ñ2Ù2á2é2ñ2ù23	333!3)3İ•ı•–1393A3I3=–Q3]–Y3a3}––i3q3y33‰3‘3™3¡3©3±3¹3Á3É3@ Ñ3Ù3á3é3ñ3½–ù34	444İ–ı–!4)41494A4I4—Q4Y4a4i4=—]—q4y44}—‰4‘4Mh—™4¡4©4½—±4¹4Á4É4Ñ4Ù4á4İ—é4ñ4ù4ı—5	555m{˜!5)515=˜95]˜A5A5I5}˜Q5Y5a5i5q5y55˜‰5‘5™5¡5©5±5½˜¹5İ˜ı˜™Á5É5Ñ5Ù5á5é5ñ5ù5=™@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @  A A!A"A#A$A%A&A'A(A)A*A+A,A-A.A/A0A1A2A3A4A5A6A7A8A9A:A;A<A=A>A?A@AAABACADAEAFAGAHAIAJAKALAMANAOAPAQARASATAUAVAWAXAYAZA[A\A]A^A_A`AaAbAcAdAeAfAgAhAiAjAkAlAmAnAoApAqArAsAtAuAvAwAxAyAzA{A|A}A~BÂ¢BÂ£BÂ¥BÂ¦BÂ¬BÂ·BÃ†BÃ¦BÃ°BÃ¸BÄ¦BÄ§BÄ±BÅ‹BÅ“BÆBÆBÆ«BÇ€BÇBÇ‚BÈ¢BÈ·BÉBÉ‘BÉ’BÉ“BÉ”BÉ•BÉ–BÉ—BÉ˜BÉ™BÉ›BÉœBÉBÉŸBÉ BÉ¡BÉ¢BÉ£BÉ¤BÉ¥BÉ¦BÉ§BÉ¨BÉ©BÉªBÉ«BÉ¬BÉ­BÉ®BÉ¯BÉ°BÉ±BÉ²BÉ³BÉ´BÉµBÉ¶BÉ·BÉ¸BÉ¹BÉºBÉ»BÉ½BÉ¾BÊ€BÊBÊ‚BÊƒBÊ„BÊˆBÊ‰BÊŠBÊ‹BÊŒBÊBÊBÊBÊBÊ‘BÊ’BÊ•BÊ˜BÊ™BÊ›BÊœBÊBÊŸBÊ¡BÊ¢BÊ£BÊ¤BÊ¥BÊ¦BÊ§BÊ¨BÊ©BÊªBÊ«BÊ¹BËBË‘BÎ‘BÎ’BÎ“BÎ”BÎ•BÎ–BÎ—BÎ˜BÎ™BÎšBÎ›BÎœBÎBÎBÎŸBÎ BÎ¡BÎ£BÎ¤BÎ¥BÎ¦BÎ§BÎ¨BÎ©BÎ±BÎ²BÎ³BÎ´BÎµBÎ¶BÎ·BÎ¸BÎ¹BÎºBÎ»BÎ¼BÎ½BÎ¾BÎ¿BÏ€BÏBÏ‚BÏƒBÏ„BÏ…BÏ†BÏ‡BÏˆBÏ‰BÏœBÏBĞ°BĞ±BĞ²BĞ³BĞ´BĞµBĞ¶BĞ·BĞ¸BĞºBĞ»BĞ¼BĞ½BĞ¾BĞ¿BÑ€BÑBÑ‚BÑƒBÑ„BÑ…BÑ†BÑ‡BÑˆBÑŠBÑ‹BÑŒBÑBÑBÑ•BÑ–BÑ˜BÑŸBÒ‘BÒ«BÒ¯BÒ±BÓBÓ™BÓ©B×B×‘B×’B×“B×”B×›B×œB×B×¢B×¨B×ªBØ¡BØ§BØ¨BØ©BØªBØ«BØ¬BØ­BØ®BØ¯BØ°BØ±BØ²BØ³BØ´BØµBØ¶BØ·BØ¸BØ¹BØºBÙBÙ‚BÙƒBÙ„BÙ…BÙ†BÙ‡BÙˆBÙ‰BÙŠBÙ®BÙ¯BÙ±BÙ¹BÙºBÙ»BÙ¾BÙ¿BÚ€BÚƒBÚ„BÚ†BÚ‡BÚˆBÚŒBÚBÚBÚ‘BÚ˜BÚ¡BÚ¤BÚ¦BÚ©BÚ­BÚ¯BÚ±BÚ³BÚºBÚ»BÚ¾BÛBÛ…BÛ†BÛ‡BÛˆBÛ‰BÛ‹BÛŒBÛBÛ’Cà¼‹CáƒœCá„€Cá„Cá„‚Cá„ƒCá„„Cá„…Cá„†Cá„‡Cá„ˆCá„‰Cá„ŠCá„‹Cá„ŒCá„Cá„Cá„Cá„Cá„‘Cá„’Cá„”Cá„•Cá„šCá„œCá„Cá„Cá„ Cá„¡Cá„¢Cá„£Cá„§Cá„©Cá„«Cá„¬Cá„­Cá„®Cá„¯Cá„²Cá„¶Cá…€Cá…‡Cá…ŒCá…—Cá…˜Cá…™Cá… Cá†„Cá†…Cá†ˆCá†‘Cá†’Cá†”Cá†Cá†¡Cá‡‡Cá‡ˆCá‡ŒCá‡Cá‡“Cá‡—Cá‡™Cá‡Cá‡ŸCá‡±Cá‡²Cá´‚Cá´–Cá´—Cá´œCá´Cá´¥Cáµ»Cá¶…Cá¶‘Câ€‚Câ€ƒCâ€Câ€“Câ€”Câ‚©Câ†Câ†‘Câ†’Câ†“Câˆ‚Câˆ‡Câˆ‘Câˆ’Câ”‚Câ– Câ—‹Câ¦…Câ¦†Câ±±Câµ¡Cã€Cã€‚Cã€ˆCã€‰Cã€ŠCã€‹Cã€ŒCã€Cã€Cã€Cã€Cã€‘Cã€’Cã€”Cã€•Cã€–Cã€—Cã‚¡Cã‚¢Cã‚£Cã‚¤Cã‚¥Cã‚¦Cã‚§Cã‚¨Cã‚©Cã‚ªCã‚«Cã‚­Cã‚¯Cã‚±Cã‚³Cã‚µCã‚·Cã‚¹Cã‚»Cã‚½Cã‚¿CãƒCãƒƒCãƒ„Cãƒ†CãƒˆCãƒŠCãƒ‹CãƒŒCãƒCãƒCãƒCãƒ’Cãƒ•Cãƒ˜Cãƒ›CãƒCãƒŸCãƒ Cãƒ¡Cãƒ¢Cãƒ£Cãƒ¤Cãƒ¥Cãƒ¦Cãƒ§Cãƒ¨Cãƒ©CãƒªCãƒ«Cãƒ¬Cãƒ­Cãƒ¯Cãƒ°Cãƒ±Cãƒ²Cãƒ³Cãƒ»Cãƒ¼Cã’Cã’¹Cã’»Cã“ŸCã”•Cã›®Cã›¼CãCã ¯Cã¡¢Cã¡¼Cã£‡Cã££Cã¤œCã¤ºCã¨®Cã©¬Cã«¤Cã¬ˆCã¬™Cã­‰Cã®Cã°˜Cã±Cã´³Cã¶–Cãº¬Cãº¸Cã¼›Cã¿¼Cä€ˆCä€˜Cä€¹Cä†Cä‚–Cäƒ£Cä„¯Cäˆ‚Cäˆ§CäŠ CäŒCäŒ´Cä™Cä•Cä™Cä‹Cä‘«Cä”«Cä•Cä•¡Cä•«Cä——Cä—¹Cä˜µCäš¾Cä›‡Cä¦•Cä§¦Cä©®Cä©¶Cäª²Cä¬³Cä¯Cä³Cä³­Cä³¸Cäµ–Cä¸€Cä¸Cä¸ƒCä¸‰Cä¸ŠCä¸‹Cä¸Cä¸™Cä¸¦Cä¸¨Cä¸­Cä¸²Cä¸¶Cä¸¸Cä¸¹Cä¸½Cä¸¿Cä¹Cä¹™Cä¹Cäº‚Cäº…Cäº†CäºŒCäº”Cäº Cäº¤Cäº®CäººCä»€Cä»ŒCä»¤Cä¼Cä¼‘Cä½ Cä¾€Cä¾†Cä¾‹Cä¾®Cä¾»Cä¾¿Cå€‚Cå€«CåºCå‚™CåƒCåƒšCåƒ§Cå„ªCå„¿Cå…€Cå……Cå…Cå…”Cå…¤Cå…¥Cå…§Cå…¨Cå…©Cå…«Cå…­Cå…·Cå†€Cå†‚Cå†Cå†’Cå†•Cå†–Cå†—Cå†™Cå†¤Cå†«Cå†¬Cå†µCå†·Cå‡‰Cå‡ŒCå‡œCå‡Cå‡ Cå‡µCåˆ€CåˆƒCåˆ‡Cåˆ—CåˆCåˆ©CåˆºCåˆ»Cå‰†Cå‰Cå‰²Cå‰·CåŠ‰CåŠ›CåŠ£CåŠ³CåŠ´Cå‹‡Cå‹‰Cå‹’Cå‹Cå‹¤Cå‹µCå‹¹Cå‹ºCåŒ…CåŒ†CåŒ•CåŒ—CåŒšCåŒ¸CåŒ»CåŒ¿CåCå„Cå…Cå‰Cå‘Cå”CåšCåœCå©Cå°Cå³CåµCå½Cå¿Cå‚Cå¶CåƒCåˆCåŠCåŒCåŸCå£Cå¥Cå«Cå¯Cå±Cå³Cå†CåˆCåCåCåCå¸Cå¹Cå‘‚Cå‘ˆCå‘¨Cå’Cå’¢Cå’½Cå“¶Cå”Cå•Cå•“Cå••Cå•£Cå–„Cå–‡Cå–™Cå–Cå–«Cå–³Cå–¶Cå—€Cå—‚Cå—¢Cå˜†Cå™‘Cå™¨Cå™´Cå›—Cå››Cå›¹Cåœ–Cåœ—CåœŸCåœ°Cå‹CåŸCåŸ´Cå Cå ±Cå ²Cå¡€Cå¡šCå¡Cå¢¨Cå¢¬Cå¢³Cå£˜Cå£ŸCå£«Cå£®Cå£°Cå£²Cå£·Cå¤‚Cå¤†Cå¤ŠCå¤•Cå¤šCå¤œCå¤¢Cå¤§Cå¤©Cå¥„Cå¥ˆCå¥‘Cå¥”Cå¥¢Cå¥³Cå§˜Cå§¬Cå¨›Cå¨§Cå©¢Cå©¦CåªµCå¬ˆCå¬¨Cå¬¾Cå­Cå­—Cå­¦Cå®€Cå®…Cå®—Cå¯ƒCå¯˜Cå¯§Cå¯®Cå¯³Cå¯¸Cå¯¿Cå°†Cå°Cå°¢Cå°¸Cå°¿Cå± Cå±¢Cå±¤Cå±¥Cå±®Cå±±Cå²Cå³€Cå´™CåµƒCåµCåµ«Cåµ®Cåµ¼Cå¶²Cå¶ºCå·›Cå·¡Cå·¢Cå·¥Cå·¦Cå·±Cå·½Cå·¾Cå¸¨Cå¸½Cå¹©Cå¹²Cå¹´Cå¹ºCå¹¼Cå¹¿Cåº¦Cåº°Cåº³Cåº¶Cå»‰Cå»ŠCå»’Cå»“Cå»™Cå»¬Cå»´Cå»¾Cå¼„Cå¼‹Cå¼“Cå¼¢Cå½Cå½“Cå½¡Cå½¢Cå½©Cå½«Cå½³Cå¾‹Cå¾ŒCå¾—Cå¾šCå¾©Cå¾­Cå¿ƒCå¿Cå¿—Cå¿µCå¿¹Cæ€’Cæ€œCæµCæ‚Cæ‚”Cæƒ‡Cæƒ˜Cæƒ¡Cæ„ˆCæ…„Cæ…ˆCæ…ŒCæ…Cæ… Cæ…¨Cæ…ºCæ†Cæ†Cæ†¤Cæ†¯Cæ†²Cæ‡Cæ‡²Cæ‡¶Cæˆ€CæˆˆCæˆCæˆ›Cæˆ®Cæˆ´Cæˆ¶Cæ‰‹Cæ‰“Cæ‰CæŠ•CæŠ±Cæ‹‰Cæ‹Cæ‹“Cæ‹”Cæ‹¼Cæ‹¾CæŒ‡CæŒ½CæCæ•Cæ¨Cæ»CæƒCæ Cæ©Cæ„Cæ…Cæ¤CæœCæ¢Cæ‘’Cæ‘©Cæ‘·Cæ‘¾Cæ’šCæ’Cæ“„Cæ”¯Cæ”´Cæ•Cæ•–Cæ•¬Cæ•¸Cæ–‡Cæ–—Cæ–™Cæ–¤Cæ–°Cæ–¹Cæ—…Cæ— Cæ—¢Cæ—£Cæ—¥Cæ˜“Cæ˜ Cæ™‰Cæ™´CæšˆCæš‘CæšœCæš´Cæ›†Cæ›°Cæ›´Cæ›¸Cæœ€CæœˆCæœ‰Cæœ—Cæœ›Cæœ¡Cæœ¨CæCæ“Cæ–CæCæ»Cæ…Cæ—CæŸ³CæŸºCæ —Cæ ŸCæ ªCæ¡’Cæ¢Cæ¢…Cæ¢Cæ¢¨Cæ¤”Cæ¥‚Cæ¦£Cæ§ªCæ¨‚Cæ¨“Cæª¨Cæ«“Cæ«›Cæ¬„Cæ¬ Cæ¬¡Cæ­”Cæ­¢Cæ­£Cæ­²Cæ­·Cæ­¹Cæ®ŸCæ®®Cæ®³Cæ®ºCæ®»Cæ¯‹Cæ¯Cæ¯”Cæ¯›Cæ°Cæ°”Cæ°´Cæ±Cæ±§Cæ²ˆCæ²¿Cæ³ŒCæ³Cæ³¥Cæ³¨Cæ´–Cæ´›Cæ´Cæ´´Cæ´¾CæµCæµ©CæµªCæµ·Cæµ¸Cæ¶…Cæ·‹Cæ·šCæ·ªCæ·¹Cæ¸šCæ¸¯Cæ¹®Cæº€CæºœCæººCæ»‡Cæ»‹Cæ»‘Cæ»›Cæ¼Cæ¼”Cæ¼¢Cæ¼£Cæ½®Cæ¿†Cæ¿«Cæ¿¾Cç€›Cç€Cç€¹CçŠCç«Cç°Cç·Cç½Cç‚™Cç‚­CçƒˆCçƒ™Cç„¡Cç……Cç…‰Cç…®Cç†œCç‡Cç‡CçˆCçˆ›Cçˆ¨CçˆªCçˆ«CçˆµCçˆ¶Cçˆ»Cçˆ¿Cç‰‡Cç‰Cç‰™Cç‰›Cç‰¢Cç‰¹CçŠ€CçŠ•CçŠ¬CçŠ¯Cç‹€Cç‹¼CçŒªCçµCçºCç„Cç‡Cç‰Cç‹Cç¥Cç²CçCç†Cç‰Cç¢Cç‘‡Cç‘œCç‘©Cç‘±Cç’…Cç’‰Cç’˜Cç“ŠCç“œCç“¦Cç”†Cç”˜Cç”ŸCç”¤Cç”¨Cç”°Cç”²Cç”³Cç”·Cç”»Cç”¾Cç•™Cç•¥Cç•°Cç–‹Cç–’Cç—¢Cç˜Cç˜Cç˜ŸCç™‚Cç™©Cç™¶Cç™½Cçš®Cçš¿Cç›ŠCç››Cç›£Cç›§Cç›®Cç›´CçœCçœCçœŸCç€CçŠCç‹Cç§CçŸ›CçŸ¢CçŸ³Cç¡Cç¡«Cç¢ŒCç¢‘Cç£ŠCç£ŒCç£»Cç¤ªCç¤ºCç¤¼Cç¤¾Cç¥ˆCç¥‰Cç¥Cç¥–Cç¥Cç¥Cç¥¥Cç¥¿Cç¦Cç¦Cç¦Cç¦Cç¦®Cç¦¸Cç¦¾Cç§ŠCç§˜Cç§«Cç¨œCç©€Cç©ŠCç©Cç©´Cç©ºCçªCçª±Cç«‹Cç«®Cç«¹Cç¬ Cç®Cç¯€Cç¯†Cç¯‰Cç°¾Cç± Cç±³Cç±»Cç²’Cç²¾Cç³’Cç³–Cç³£Cç³§Cç³¨Cç³¸Cç´€Cç´Cç´¢Cç´¯Cçµ‚Cçµ›Cçµ£Cç¶ Cç¶¾Cç·‡Cç·´Cç¸‚Cç¸‰Cç¸·Cç¹Cç¹…Cç¼¶Cç¼¾Cç½‘Cç½²Cç½¹Cç½ºCç¾…Cç¾ŠCç¾•Cç¾šCç¾½Cç¿ºCè€Cè€…Cè€ŒCè€’Cè€³Cè†Cè Cè¯Cè°Cè¾Cè¿Cè‚‰Cè‚‹Cè‚­Cè‚²Cè„ƒCè„¾Cè‡˜Cè‡£Cè‡¨Cè‡ªCè‡­Cè‡³Cè‡¼CèˆCèˆ„CèˆŒCèˆ˜Cèˆ›CèˆŸCè‰®Cè‰¯Cè‰²Cè‰¸Cè‰¹CèŠ‹CèŠ‘CèŠCèŠ±CèŠ³CèŠ½Cè‹¥Cè‹¦CèŒCèŒ£CèŒ¶Cè’Cè“Cè£Cè­Cè½Cè‰CèŠCèŒCèœCè§Cè¯Cè±Cè½Cè‘‰Cè‘—Cè“®Cè“±Cè“³Cè“¼Cè”–Cè•¤Cè—Cè—ºCè˜†Cè˜’Cè˜­Cè˜¿Cè™Cè™Cè™œCè™§Cè™©Cè™«CèšˆCèš©Cè›¢CèœCèœ¨Cè«Cè¹Cè†CèºCèŸ¡Cè Cè ŸCè¡€Cè¡ŒCè¡ Cè¡£Cè£‚Cè£Cè£—Cè£Cè£¡Cè£¸Cè£ºCè¤Cè¥Cè¥¤Cè¥¾Cè¦†Cè¦‹Cè¦–Cè§’Cè§£Cè¨€Cèª CèªªCèª¿Cè«‹Cè«’Cè«–Cè«­Cè«¸Cè«¾Cè¬Cè¬¹Cè­˜Cè®€Cè®ŠCè°·Cè±†Cè±ˆCè±•Cè±¸Cè²Cè²¡Cè²©Cè²«Cè³Cè³‚Cè³‡Cè³ˆCè³“Cè´ˆCè´›Cèµ¤Cèµ°Cèµ·Cè¶³Cè¶¼Cè·‹Cè·¯Cè·°Cèº«Cè»ŠCè»”Cè¼¦Cè¼ªCè¼¸Cè¼»Cè½¢Cè¾›Cè¾Cè¾°Cè¾µCè¾¶Cé€£Cé€¸CéŠCé©Cé²Cé¼Cé‚Cé‚‘Cé‚”CéƒCéƒCéƒ±Céƒ½Cé„‘Cé„›Cé…‰Cé…Cé…ªCé†™Cé†´Cé‡†Cé‡ŒCé‡Cé‡‘Céˆ´Céˆ¸Cé‰¶Cé‰¼Cé‹—Cé‹˜CéŒ„CéŠCé¹Cé•Cé•·Cé–€Cé–‹Cé–­Cé–·Cé˜œCé˜®Cé™‹Cé™Cé™µCé™¸Cé™¼Céš†Céš£Céš¶Céš·Céš¸Céš¹Cé›ƒCé›¢Cé›£Cé›¨Cé›¶Cé›·Céœ£Céœ²CéˆCé‘Cé–CéCé¢Cé©CéŸ‹CéŸ›CéŸ CéŸ­CéŸ³CéŸ¿Cé Cé …Cé ‹Cé ˜Cé ©Cé »Cé¡Cé¢¨Cé£›Cé£ŸCé£¢Cé£¯Cé£¼Cé¤¨Cé¤©Cé¦–Cé¦™Cé¦§Cé¦¬Cé§‚Cé§±Cé§¾Cé©ªCéª¨Cé«˜Cé«ŸCé¬’Cé¬¥Cé¬¯Cé¬²Cé¬¼Cé­šCé­¯Cé±€Cé±—Cé³¥Cé³½Céµ§Cé¶´Cé·ºCé¸Cé¹µCé¹¿Céº—CéºŸCéº¥Céº»Cé»ƒCé»Cé»Cé»‘Cé»¹Cé»½Cé»¾Cé¼…Cé¼Cé¼Cé¼“Cé¼–Cé¼ Cé¼»Cé½ƒCé½ŠCé½’Cé¾Cé¾Cé¾œCé¾ŸCé¾ Cê™‘Cêš‰Cêœ§Cê¯CêCê¬·Cê­’Cê­¦Cê­§Dğ¼„Dğ¼…Dğ¼†Dğ¼ˆDğ¼ŠDğ¼Dğ „¢Dğ ”œDğ ”¥Dğ •‹Dğ ˜ºDğ  „Dğ £Dğ ¨¬Dğ ­£Dğ¡“¤Dğ¡š¨Dğ¡›ªDğ¡§ˆDğ¡¬˜Dğ¡´‹Dğ¡·¤D