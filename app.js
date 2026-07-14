// ============================================================
// CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tmucjycefiyhthgoladq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GRERFbwae5xPLjMPG55zXA_Z2GWb3qB';
let sb = null;

// ============================================================
// LISTAS ESTÁTICAS
// ============================================================
// Áreas reales del sistema (usadas para asignar doctores y filtrar colas)
const AREAS_ESTATICAS = [
  'Medicina General',
  'Odontología',
  'Pediatría',
  'Obstetricia',
  'Traumatología',
  'Fisioterapia',
  'Psicología Clínica',
  'Nutrición',
  'Urología',
  'Imagenología',
  'Farmacia',
  'Corte de Cabello'
];

// Opciones que ve el Turnero al registrar al paciente.
// Algunas son alias que se redirigen a un área real con una nota de motivo.
const OPCIONES_ESPECIALIDAD = [
  { label: 'Medicina General', area: 'Medicina General', motivo: null },
  { label: 'Odontología', area: 'Odontología', motivo: null },
  { label: 'Pediatría', area: 'Pediatría', motivo: null },
  { label: 'Obstetricia', area: 'Obstetricia', motivo: null },
  { label: 'Solo Papanicolau', area: 'Obstetricia', motivo: 'Solo Papanicolau — Sin revisión general' },
  { label: 'Traumatología', area: 'Traumatología', motivo: null },
  { label: 'Fisioterapia', area: 'Fisioterapia', motivo: null },
  { label: 'Psicología Clínica', area: 'Psicología Clínica', motivo: null },
  { label: 'Nutrición', area: 'Nutrición', motivo: null },
  { label: 'Urología', area: 'Urología', motivo: null },
  { label: 'Imagenología', area: 'Imagenología', motivo: null },
  { label: 'Farmacia', area: 'Farmacia', motivo: null },
  { label: 'Corte de Cabello', area: 'Corte de Cabello', motivo: null }
];



// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  role: null,           // 'turnero' | 'enfermera' | 'doctor' | 'admin'
  userName: '',
  adminPass: '',        // Se guarda temporalmente para las llamadas a RPC de admin
  areaId: null,         // Área seleccionada por el doctor
  areas: [],
  enfermeras: [],
  online: false,
  autoRefreshInterval: null
};

// ============================================================
// APP
// ============================================================
const app = {

  // ---- ARRANQUE ----
  async init() {
    Estado.areas = AREAS_ESTATICAS;
    this.llenarSelects();

    try {
      if (!window.supabase) throw new Error('SDK no disponible');
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { error } = await sb.from('pacientes_espera').select('id').limit(1);
      if (error) throw error;
      Estado.online = true;
      console.log('✅ Supabase en línea');
      this.verificarSesionGuardada();
    } catch (e) {
      Estado.online = false;
      console.warn('⚠️ Modo offline / tabla no lista:', e.message);
    }
  },

  llenarSelects() {
    // Opciones para el Turnero (incluye alias como Solo Papanicolau)
    const selPac = document.getElementById('pacienteEspecialidad');
    if (selPac) {
      selPac.innerHTML = '<option value="">-- Seleccionar Área / Servicio --</option>';
      OPCIONES_ESPECIALIDAD.forEach(op => {
        selPac.innerHTML += `<option value="${op.label}">${op.label}${op.motivo ? ' 📋' : ''}</option>`;
      });
    }
    // Áreas reales para el admin (doctores se asignan a áreas reales)
    const selAdmin = document.getElementById('adminNewArea');
    if (selAdmin) {
      selAdmin.innerHTML = '<option value="">-- Sin Área --</option>';
      Estado.areas.forEach(a => { selAdmin.innerHTML += `<option value="${a}">${a}</option>`; });
    }
  },

  verificarSesionGuardada() {
    const sesionInfo = localStorage.getItem('turnero_session');
    if (sesionInfo) {
      try {
        const parsed = JSON.parse(sesionInfo);
        Estado.role = parsed.role;
        Estado.userName = parsed.userName;
        Estado.areaId = parsed.areaId;
        Estado.adminPass = parsed.adminPass || '';
        this.restaurarVistaSegunRol();
      } catch (e) {
        console.error('Error parseando sesión', e);
      }
    }
  },

  async restaurarVistaSegunRol() {
    if (Estado.role === 'admin') {
      this.cerrarOverlay('👑', 'Administrador');
      this.mostrarVista('admin');
      this.adminCargarUsuarios();
    } else if (Estado.role === 'turnero') {
      this.cerrarOverlay('📝', Estado.userName);
      this.mostrarVista('darTurno');
      this.cargarHistorialTurnero();
      this.cargarAgenda();
    } else if (Estado.role === 'enfermera') {
      this.cerrarOverlay('🩺', Estado.userName);
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();
      if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesTriaje(), 5000);
    } else if (Estado.role === 'doctor') {
      if (!Estado.areaId) return; // Error preventivo
      this.cerrarOverlay('👨‍⚕️', Estado.areaId);
      const titulo = document.getElementById('tituloConsultorio');
      if (titulo) titulo.innerText = 'Área: ' + Estado.areaId;
      this.mostrarVista('misPacientes');
      await this.cargarPacientesArea();
      if (Estado.autoRefreshInterval) clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = setInterval(() => this.cargarPacientesArea(), 5000);
    }
  },

  // ---- NAVEGACIÓN ----

  mostrarVista(vistaId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + vistaId);
    if (el) el.classList.add('active');
  },

  cerrarOverlay(badge, nombre) {
    document.getElementById('overlay').style.display = 'none';
    const rb = document.getElementById('roleBadge');
    const dn = document.getElementById('displayUserName');
    if (rb) rb.innerText = badge;
    if (dn) dn.innerText = nombre;

    const btnDash = document.getElementById('btnNavDashboard');
    if (btnDash) {
      btnDash.style.display = Estado.role === 'admin' ? 'inline-block' : 'none';
    }
  },

  // ---- CERRAR SESIÓN ----
  cerrarSesion() {
    if (Estado.autoRefreshInterval) {
      clearInterval(Estado.autoRefreshInterval);
      Estado.autoRefreshInterval = null;
    }
    Estado.role = null;
    Estado.userName = '';
    Estado.areaId = null;
    Estado.adminPass = '';
    localStorage.removeItem('turnero_session');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  },

  // ============================================================
  // MODO PANTALLA PÚBLICA (TV)
  // ============================================================
  tvInterval: null,
  tvUltimos: [],
  tvPrimeraCargaHecha: false,

  abrirModoTV() {
    document.getElementById('overlay').style.display = 'none';
    const header = document.querySelector('header');
    if (header) header.style.display = 'none';
    this.mostrarVista('tv');

    // Activar sonido inicial para permisos de navegador (autoplay policy)
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch (e) { }

    this.tvUltimos = [];
    this.tvPrimeraCargaHecha = false;
    this.tvInterval = setInterval(() => this.actualizarTV(), 3000);
    this.actualizarTV();
  },

  cerrarModoTV() {
    if (this.tvInterval) clearInterval(this.tvInterval);
    document.getElementById('overlay').style.display = 'flex';
    const header = document.querySelector('header');
    if (header) header.style.display = 'flex';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  },

  async actualizarTV() {
    if (!Estado.online || !sb) return;
    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('estado', 'en_consulta')
        .order('id', { ascending: false });

      if (error) throw error;

      if (!data) return;

      const llamadosActuales = data.map(t => t.id);

      if (!this.tvPrimeraCargaHecha) {
        this.tvUltimos = llamadosActuales;
        this.tvPrimeraCargaHecha = true;
        return;
      }

      const nuevos = data.filter(t => !this.tvUltimos.includes(t.id));

      if (nuevos.length > 0) {
        const paciente = nuevos[0]; // Tomar el primero nuevo
        this.anunciarTurnoTV(paciente);

        // Actualizar lista
        this.tvUltimos = llamadosActuales;
      }

    } catch (e) {
      console.error('Error TV:', e);
    }
  },

  anunciarTurnoTV(paciente) {
    const turnoTxt = paciente.numero_turno_area
      ? paciente.especialidad.substring(0, 3).toUpperCase() + '-' + paciente.numero_turno_area
      : 'Nuevo Paciente';

    const mainContent = document.getElementById('tvContent');
    if (mainContent) {
      mainContent.innerHTML = `
        <div style="font-size: 6rem; color: #38bdf8; font-weight: 900; line-height: 1.1; margin-bottom: 1rem; text-shadow: 0 0 40px rgba(56, 189, 248, 0.4); animation: pulse 2s infinite;">${turnoTxt}</div>
        <div style="font-size: 4rem; color: white; font-weight: 700; margin-bottom: 2rem;">${paciente.nombre}</div>
        <div style="font-size: 2.5rem; color: #cbd5e1; background: rgba(255,255,255,0.1); padding: 1.5rem 4rem; border-radius: 20px; border: 2px solid rgba(255,255,255,0.2);">Pasar a <strong style="color: #34d399;">${paciente.especialidad}</strong></div>
      `;
    }

    const historyContainer = document.getElementById('tvUltimosLlamados');
    if (historyContainer) {
      const historyItem = document.createElement('div');
      historyItem.style.cssText = "background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; min-width: 200px; border-left: 4px solid #38bdf8;";
      historyItem.innerHTML = `<div style="font-size: 1.5rem; font-weight: bold; color: white;">${turnoTxt}</div><div style="color: #94a3b8; font-size: 0.9rem; margin-top: 5px;">${paciente.especialidad}</div>`;

      historyContainer.prepend(historyItem);
      if (historyContainer.children.length > 5) {
        historyContainer.lastChild.remove();
      }
    }

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);
      osc.start();
      osc.stop(ctx.currentTime + 1);

      setTimeout(() => {
        const u = new SpeechSynthesisUtterance(`Turno ${turnoTxt}, paciente ${paciente.nombre}. Por favor acercarse a ${paciente.especialidad}`);
        u.lang = 'es-ES';
        u.rate = 0.9;
        speechSynthesis.speak(u);
      }, 800);
    } catch (e) { console.error('Audio error', e); }
  },

  // ============================================================
  // ROL: TURNERO (solo registra datos básicos, SIN número de turno)
  // ============================================================
  async iniciarSesion() {
    const user = (document.getElementById('loginUsername').value || '').trim();
    const pass = (document.getElementById('loginPassword').value || '').trim();

    if (!user || !pass) {
      this.toast('Ingresa usuario y contraseña', 'error');
      return;
    }

    const btn = document.getElementById('btnIngresar');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Verificando...';

    try {
      if (!Estado.online || !sb) throw new Error('Sin conexión a Base de Datos');

      const { data, error } = await sb.rpc('verificar_login', {
        p_username: user,
        p_password: pass
      });

      if (error) throw error;

      if (!data || !data.success) {
        throw new Error(data?.message || 'Credenciales incorrectas');
      }

      Estado.role = data.role;
      Estado.userName = data.username;
      Estado.areaId = data.area || null;
      if (Estado.role === 'admin') Estado.adminPass = pass;

      localStorage.setItem('turnero_session', JSON.stringify({
        role: Estado.role,
        userName: Estado.userName,
        areaId: Estado.areaId,
        adminPass: Estado.adminPass
      }));

      this.restaurarVistaSegunRol();

    } catch (e) {
      console.error(e);
      this.toast(e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = originalText;
  },

  async buscarPacienteExistente() {
    const cedulaInput = document.getElementById('pacienteCedula');
    if (!cedulaInput) return;
    const cedula = cedulaInput.value.trim();
    const feedback = document.getElementById('cedulaFeedback');

    if (!cedula || cedula.length < 5) {
      if (feedback) feedback.style.display = 'none';
      return;
    }

    if (!Estado.online || !sb) return;

    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.color = 'var(--text-muted)';
      feedback.innerText = 'Buscando paciente...';
    }

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('nombre, celular, direccion')
        .eq('cedula', cedula)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const p = data[0];
        // Remover tags como [Receta: 1234] o [Solo Papanicolau] si existen en el nombre del historial
        let nombreLimpio = p.nombre || '';
        if (nombreLimpio.startsWith('[')) {
          nombreLimpio = nombreLimpio.replace(/^\[.*?\]\s*/, '');
        }

        document.getElementById('pacienteNameInput').value = nombreLimpio;
        if (p.celular) document.getElementById('pacienteCelular').value = p.celular;
        if (p.direccion) document.getElementById('pacienteDireccion').value = p.direccion;

        if (feedback) {
          feedback.style.color = 'var(--success)';
          feedback.innerHTML = '✅ Paciente existente. Datos autocompletados.';
        }
      } else {
        if (feedback) {
          feedback.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('Error buscando paciente', e);
      if (feedback) feedback.style.display = 'none';
    }
  },

  async darTurno(directoEspecialidad = false) {
    const btn = document.getElementById(directoEspecialidad ? 'btnDarTurnoDirecto' : 'btnDarTurno');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Registrando...';

    const nombre = document.getElementById('pacienteNameInput').value.trim();
    const cedula = document.getElementById('pacienteCedula').value.trim();
    const celular = document.getElementById('pacienteCelular').value.trim();
    const direccion = document.getElementById('pacienteDireccion').value.trim();
    const seleccion = document.getElementById('pacienteEspecialidad').value;

    if (!nombre) {
      this.toast('Ingresa el nombre del paciente', 'error');
      btn.disabled = false; btn.innerText = originalText; return;
    }
    if (!seleccion) {
      this.toast('Selecciona la especialidad / área', 'error');
      btn.disabled = false; btn.innerText = originalText; return;
    }

    // Resolver la opción seleccionada → área real + motivo
    const opcion = OPCIONES_ESPECIALIDAD.find(op => op.label === seleccion);
    const especialidad = opcion ? opcion.area : seleccion;
    const motivoExtra = opcion ? opcion.motivo : null;

    try {
      // Leer si es cita programada
      const tipoTurnoOpt = document.querySelector('input[name="tipo_turno"]:checked');
      const esCitaProgramada = tipoTurnoOpt && tipoTurnoOpt.value === 'programado';
      const fechaCita = esCitaProgramada ? document.getElementById('pacienteFechaCita').value : null;

      if (esCitaProgramada && !fechaCita) {
        this.toast('Selecciona la fecha y hora para la cita', 'error');
        btn.disabled = false; btn.innerText = originalText; return;
      }

      if (Estado.online && sb) {
        let estadoStr = esCitaProgramada ? 'programado' : (directoEspecialidad ? 'pendiente' : 'en_espera');
        let atendidoPor = directoEspecialidad ? 'Directo desde Recepción' : null;

        // Solo calcular número de turno si no es cita programada
        let numTurno = null;
        if (!esCitaProgramada) {
          const { data: maxData } = await sb.from('pacientes_espera')
            .select('numero_turno_area')
            .eq('especialidad', especialidad)
            .not('numero_turno_area', 'is', null)
            .order('numero_turno_area', { ascending: false })
            .limit(1);

          numTurno = 1;
          if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
            numTurno = maxData[0].numero_turno_area + 1;
          }
        }

        // Si hay motivo especial (ej: Solo Papanicolau), se incluye como prefijo
        // en el nombre del servicio almacenado para que el doctor lo vea en su cola
        const nombreConMotivo = motivoExtra ? `[${motivoExtra}] ${nombre}` : nombre;

        const insertObj = {
          nombre: nombreConMotivo,
          cedula: cedula,
          celular: celular,
          direccion: direccion,
          especialidad: especialidad,
          numero_turno_area: numTurno,
          creado_por: Estado.userName,
          atendido_por: atendidoPor,
          estado: estadoStr
        };

        if (esCitaProgramada && fechaCita) {
          insertObj.fecha_cita = new Date(fechaCita).toISOString();
        }

        const { error } = await sb.from('pacientes_espera').insert(insertObj);
        if (error) throw error;
      }

      const etiqueta = motivoExtra ? `${seleccion} → ${especialidad}` : especialidad;
      const tipoMsg = esCitaProgramada ? `📅 Cita agendada para ${new Date(fechaCita).toLocaleString('es-EC')}` : `✅ "${nombre}" → ${etiqueta}`;
      this.toast(tipoMsg, 'success');
      document.getElementById('pacienteNameInput').value = '';
      document.getElementById('pacienteCedula').value = '';
      document.getElementById('pacienteCelular').value = '';
      document.getElementById('pacienteDireccion').value = '';
      document.getElementById('pacienteEspecialidad').value = '';
      // Reset tipo turno
      const hoyOpt = document.querySelector('input[name="tipo_turno"][value="hoy"]');
      if (hoyOpt) hoyOpt.checked = true;
      const fechaContaner = document.getElementById('fechaCitaContainer');
      if (fechaContaner) fechaContaner.style.display = 'none';

      if (document.getElementById('cedulaFeedback')) document.getElementById('cedulaFeedback').style.display = 'none';
      this.cargarHistorialTurnero();
      this.cargarAgenda();

      // Solo imprimir ticket si es turno de hoy
      if (!esCitaProgramada) {
        this.imprimirTicket({
          nombre: nombre,
          especialidad: especialidad,
          numero_turno_area: numTurno
        });
      }

    } catch (err) {
      console.error(err);
      this.toast('Error al registrar: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = originalText;
  },

  imprimirTicket(paciente) {
    let printArea = document.getElementById('printArea');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'printArea';
      document.body.appendChild(printArea);
    }

    const turnoText = paciente.numero_turno_area
      ? `${paciente.especialidad.substring(0, 3).toUpperCase()}-${paciente.numero_turno_area}`
      : 'EN ESPERA';

    printArea.innerHTML = `
      <div class="ticket-print">
        <p>RENOVACIÓN MONTUFAREÑA</p>
        <p>SISTEMA DE TURNOS</p>
        <div class="line"></div>
        <p style="font-size: 14px;"><strong>${paciente.especialidad}</strong></p>
        <h2>${turnoText}</h2>
        <div class="line"></div>
        <p>Paciente:</p>
        <h1>${paciente.nombre}</h1>
        <p>Fecha: ${new Date().toLocaleDateString('es-EC')} ${new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</p>
        <div class="line"></div>
        <p>Por favor, espere su llamado</p>
        <p>en la pantalla pública.</p>
      </div>
    `;

    setTimeout(() => {
      window.print();
    }, 100);
  },

  async cargarHistorialTurnero() {
    const lista = document.getElementById('turneroHistoryList');
    if (!lista) return;
    if (!Estado.online || !sb) return;

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('nombre, cedula, estado, especialidad, numero_turno_area, creado_por')
        .eq('creado_por', Estado.userName)
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;

      lista.innerHTML = '';
      if (!data || data.length === 0) {
        lista.innerHTML = `
          <li>
            <div class="state-empty">
              <span class="state-empty-icon">💭</span>
              <span class="state-empty-text">No has registrado pacientes aún</span>
            </div>
          </li>`;
        return;
      }

      data.forEach(t => {
        const turnoLabel = t.numero_turno_area
          ? `<span class="badge-turno">🎫 ${t.especialidad ? t.especialidad.substring(0, 3).toUpperCase() : ''}-${t.numero_turno_area}</span>`
          : `<span class="badge-status espera">⏳ En Recepción</span>`;

        lista.innerHTML += `
          <li class="patient-item">
            <div class="patient-header">
              <div>
                <div class="patient-title">${t.nombre}</div>
                <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'}${t.especialidad ? ' &rarr; ' + t.especialidad : ''}</div>
              </div>
              <div>${turnoLabel}</div>
            </div>
          </li>`;
      });
    } catch (err) {
      console.error('Error historial turnero:', err);
    }
  },

  async cargarAgenda() {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    if (!Estado.online || !sb) return;

    try {
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('estado', 'programado')
        .order('fecha_cita', { ascending: true });
      if (error) throw error;

      lista.innerHTML = '';
      if (!data || data.length === 0) {
        lista.innerHTML = `
          <li>
            <div class="state-empty">
              <span class="state-empty-icon">📅</span>
              <span class="state-empty-text">No hay citas programadas</span>
            </div>
          </li>`;
        return;
      }

      data.forEach(cita => {
        const fechaFormato = cita.fecha_cita
          ? new Date(cita.fecha_cita).toLocaleString('es-EC', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Sin fecha';

        const ahora = new Date();
        const fechaCita = new Date(cita.fecha_cita);
        const esPasada = fechaCita < ahora;
        const esPronto = !esPasada && (fechaCita - ahora) < 3600000; // Menos de 1 hora

        let estadoColor = esPasada ? 'var(--danger)' : (esPronto ? '#f59e0b' : 'var(--text-muted)');

        lista.innerHTML += `
          <li class="patient-item">
            <div class="patient-header">
              <div>
                <div class="patient-title">${cita.nombre}</div>
                <div class="patient-subtitle">Cédula: ${cita.cedula || 'N/A'} | ${cita.especialidad}</div>
                <div style="font-size: 0.85rem; font-weight: 700; color: ${estadoColor}; margin-top: 4px;">
                  📅 ${fechaFormato}${esPasada ? ' — Cita Vencida' : (esPronto ? ' — ¡Próximamente!' : '')}
                </div>
              </div>
              <div class="patient-actions">
                <button class="btn-action" style="background: var(--success);" onclick="app.confirmarCita('${cita.id}', '${cita.nombre}')">
                  ✅ Llegó — Enviar a Espera
                </button>
                <button class="btn-action" style="background: var(--danger);" onclick="app.cancelarCita('${cita.id}')">
                  🗑️ Cancelar
                </button>
              </div>
            </div>
          </li>`;
      });
    } catch (err) {
      console.error('Error agenda:', err);
      lista.innerHTML = `<li class="patient-item" style="text-align:center;color:red;">Error al cargar la agenda: ${err.message}</li>`;
    }
  },

  async confirmarCita(citaId, nombre) {
    if (!Estado.online || !sb) return;
    try {
      // Calcular turno en la especialidad
      const { data: citaData, error: citaErr } = await sb.from('pacientes_espera')
        .select('*').eq('id', citaId).limit(1);
      if (citaErr || !citaData || citaData.length === 0) throw new Error('No se encontró la cita');

      const cita = citaData[0];

      const { data: maxData } = await sb.from('pacientes_espera')
        .select('numero_turno_area')
        .eq('especialidad', cita.especialidad)
        .not('numero_turno_area', 'is', null)
        .order('numero_turno_area', { ascending: false })
        .limit(1);

      let numTurno = 1;
      if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
        numTurno = maxData[0].numero_turno_area + 1;
      }

      const { error } = await sb.from('pacientes_espera')
        .update({ estado: 'en_espera', numero_turno_area: numTurno })
        .eq('id', citaId);
      if (error) throw error;

      this.toast(`✅ "${nombre}" enviado a sala de espera. Turno #${numTurno}`, 'success');
      this.cargarAgenda();
      this.imprimirTicket({ nombre: cita.nombre, especialidad: cita.especialidad, numero_turno_area: numTurno });
    } catch (e) {
      console.error(e);
      this.toast('Error al confirmar cita: ' + e.message, 'error');
    }
  },

  async cancelarCita(citaId) {
    if (!confirm('¿Estás seguro de cancelar esta cita?')) return;
    if (!Estado.online || !sb) return;
    try {
      const { error } = await sb.from('pacientes_espera')
        .update({ estado: 'cancelado' })
        .eq('id', citaId);
      if (error) throw error;
      this.toast('🗑️ Cita cancelada', 'success');
      this.cargarAgenda();
    } catch (e) {
      this.toast('Error al cancelar: ' + e.message, 'error');
    }
  },

  // ============================================================
  // ROL: ENFERMERA (Triaje y Signos Vitales)
  // ============================================================

  async cargarPacientesTriaje() {
    const listEl = document.getElementById('triajeList');
    if (!listEl) return;
    // Solo mostramos "Cargando..." si la lista está vacía (evita el parpadeo cuando se actualiza sola)
    if (listEl.innerHTML.trim() === '') {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    }
    if (!Estado.online || !sb) {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:orange;">Sin conexión a Supabase.</li>';
      return;
    }

    try {
      // La enfermera ve TODOS los que están "en_espera" (sin turno asignado aún)
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('estado', 'en_espera')
        .order('created_at', { ascending: true });
      if (error) throw error;

      const numEl = document.getElementById('currentTriajeNumber');
      const nameEl = document.getElementById('currentTriajeName');

      let newHTML = '';

      if (!data || data.length === 0) {
        newHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en recepción.</li>';
        if (numEl) numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Sin pacientes en espera';
      } else {
        if (numEl) numEl.innerText = data.length + ' en espera';
        if (nameEl) nameEl.innerText = 'Próximo: ' + data[0].nombre;

        data.forEach(t => {
          newHTML += `
            <li class="patient-item">
              <div class="patient-header" style="margin-bottom:0;">
                <div>
                  <div class="patient-title">${t.numero_turno_area ? `Turno ${(t.especialidad || '').substring(0, 3).toUpperCase()}-${t.numero_turno_area}` : `<span style="color:#f59e0b; font-size: 0.9rem;">Turno por asignar</span>`} — ${t.nombre}</div>
                  <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} | Tel: ${t.celular || 'N/A'}</div>
                  <div class="patient-subtitle">Dirección: ${t.direccion || 'N/A'}</div>
                  <div class="patient-subtitle" style="margin-top:.3rem;">
                    🏥 Área: <strong style="color:var(--primary);">${t.especialidad || 'Sin asignar'}</strong>
                  </div>
                </div>
                <div class="patient-actions">
                  <button class="btn-action btn-call" onclick="app.abrirFormularioTriaje('${t.id}', '${(t.nombre || '').replace(/'/g, "\\'")}')">
                    🩺 Tomar Signos
                  </button>
                </div>
              </div>
            </li>`;
        });
      }

      if (listEl.innerHTML !== newHTML) {
        listEl.innerHTML = newHTML;
        this.filtrarTriaje();
      }

    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error: ' + e.message + '</li>';
    }
  },

  filtrarTriaje() {
    const input = document.getElementById('inputFiltroTriaje');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll('#triajeList .patient-item');

    items.forEach(item => {
      // Evitar esconder los mensajes del sistema si están solos
      if (item.innerText.includes('Cargando...') || item.innerText.includes('No hay pacientes')) return;

      const text = item.innerText.toLowerCase();
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  },

  abrirFormularioTriaje(pacienteId, nombrePaciente) {
    document.getElementById('triajeTurnoId').value = pacienteId;
    document.getElementById('triajePacienteName').innerText = 'Paciente: ' + nombrePaciente;
    ['triajeEdad', 'triajePeso', 'triajeEstatura', 'triajePresion',
      'triajeTemperatura', 'triajeFrecuencia', 'triajeSaturacion'
    ].forEach(id => { document.getElementById(id).value = ''; });
    this.mostrarVista('formTriaje');
  },

  async guardarTriaje() {
    const pacienteId = document.getElementById('triajeTurnoId').value;
    const btn = document.getElementById('btnGuardarTriaje');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const signosVitales = {
      edad: document.getElementById('triajeEdad').value,
      peso: document.getElementById('triajePeso').value,
      estatura: document.getElementById('triajeEstatura').value,
      presion: document.getElementById('triajePresion').value,
      temperatura: document.getElementById('triajeTemperatura').value,
      frecuencia: document.getElementById('triajeFrecuencia').value,
      saturacion: document.getElementById('triajeSaturacion').value
    };

    try {
      // Leer la especialidad que ya trae el paciente (asignada por el Turnero)
      const { data: pacData } = await sb.from('pacientes_espera')
        .select('especialidad, numero_turno_area')
        .eq('id', pacienteId)
        .single();

      const especialidad = pacData?.especialidad;
      if (!especialidad) {
        this.toast('Este paciente no tiene especialidad asignada. Contacta a recepción.', 'error');
        btn.disabled = false; btn.innerText = 'Guardar Signos Vitales';
        return;
      }

      let numTurno = pacData?.numero_turno_area;

      if (!numTurno) {
        // Calcular el siguiente número de turno para esa especialidad si es un paciente antiguo
        const { data: maxData } = await sb.from('pacientes_espera')
          .select('numero_turno_area')
          .eq('especialidad', especialidad)
          .not('numero_turno_area', 'is', null)
          .order('numero_turno_area', { ascending: false })
          .limit(1);

        numTurno = 1;
        if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
          numTurno = maxData[0].numero_turno_area + 1;
        }
      }

      // Actualizar el registro con signos vitales y estado
      const { error } = await sb.from('pacientes_espera')
        .update({
          numero_turno_area: numTurno,
          estado: 'pendiente',
          atendido_por: Estado.userName,
          signos_vitales: JSON.stringify(signosVitales)
        })
        .eq('id', pacienteId);

      if (error) throw error;

      const prefijo = especialidad.substring(0, 3).toUpperCase();
      this.toast(`Turno ${prefijo}-${numTurno} asignado → ${especialidad}`, 'success');
      this.mostrarVista('triaje');
      this.cargarPacientesTriaje();

    } catch (e) {
      console.error(e);
      this.toast('Error al guardar: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = 'Guardar Signos Vitales';
  },

  // ============================================================
  // ROL: DOCTOR / ÁREA (ve solo su cola con turnos asignados)
  // ============================================================

  async cargarPacientesArea() {
    const listEl = document.getElementById('patientList');
    if (!listEl) return;
    // Solo mostramos "Cargando..." si la lista está vacía (evita el parpadeo)
    if (listEl.innerHTML.trim() === '') {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando...</li>';
    }
    if (!Estado.online || !sb) return;

    try {
      const { data: turnos, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('especialidad', Estado.areaId)
        .in('estado', ['en_espera', 'pendiente', 'en_consulta'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      Estado.turnosArea = turnos; // Guardar localmente para abrir la consulta

      const numEl = document.getElementById('currentPatientNumber');
      const nameEl = document.getElementById('currentPatientName');

      let newHTML = '';

      if (!turnos || turnos.length === 0) {
        newHTML = '<li class="patient-item" style="text-align:center;color:#666;padding:1rem;">No hay pacientes en cola para esta área.</li>';
        if (numEl) numEl.innerText = '--';
        if (nameEl) nameEl.innerText = 'Cola vacía';
      } else {
        const enConsulta = turnos.find(t => t.estado === 'en_consulta');
        // El próximo a llamar debe ser el primero que esté 'pendiente', no el que está 'en_espera'
        const proximo = enConsulta || turnos.find(t => t.estado === 'pendiente') || turnos[0];

        if (numEl) numEl.innerText = proximo.numero_turno_area ? Estado.areaId.substring(0, 3).toUpperCase() + '-' + proximo.numero_turno_area : 'Por asignar';
        if (nameEl) {
          nameEl.innerText = proximo.nombre;
          if (enConsulta) nameEl.innerHTML += '<br><span style="font-size:.8rem;background:rgba(255,255,255,.25);padding:2px 10px;border-radius:12px;display:inline-block;margin-top:6px;">EN CONSULTA</span>';
        }

        turnos.forEach(t => {
          const ec = t.estado === 'en_consulta';
          const enEspera = t.estado === 'en_espera';
          let btns = '';
          if (t.estado === 'pendiente') btns = `<button class="btn-action btn-call" onclick="app.cambiarEstado('${t.id}','en_consulta')">📢 Llamar</button>`;
          if (t.estado === 'en_consulta') btns = `<button class="btn-action btn-done" onclick="app.abrirConsulta('${t.id}')" style="background:var(--success);">👨‍⚕️ Abrir Consulta</button>`;
          if (t.estado === 'en_espera') btns = `<span style="color: #f59e0b; font-weight: bold; font-size: 0.9rem; background: #fef3c7; padding: 4px 8px; border-radius: 6px;">⏳ En Signos Vitales</span>`;

          let sv = {};
          try { sv = JSON.parse(t.signos_vitales || '{}'); } catch (e) { }

          newHTML += `
            <li class="patient-item ${ec ? 'en-consulta' : ''}">
              <div class="patient-header">
                <div>
                  <div class="patient-title">${t.numero_turno_area ? `Turno ${Estado.areaId.substring(0, 3).toUpperCase()}-${t.numero_turno_area}` : `<span style="color:#f59e0b; font-size: 0.9rem;">Turno por asignar</span>`} — ${t.nombre}</div>
                  <div class="patient-subtitle">Cédula: ${t.cedula || 'N/A'} | Tel: ${t.celular || 'N/A'} | Triaje: ${t.atendido_por || 'N/A'}</div>
                </div>
                <div class="patient-actions">${btns}</div>
              </div>
              <div class="patient-data-grid">
                <div class="data-item"><span>Dirección</span><span>${t.direccion || 'N/A'}</span></div>
                <div class="data-item"><span>Edad</span><span>${sv.edad ? sv.edad + ' años' : 'N/A'}</span></div>
                <div class="data-item"><span>Peso</span><span>${sv.peso || 'N/A'}</span></div>
                <div class="data-item"><span>Estatura</span><span>${sv.estatura || 'N/A'}</span></div>
                <div class="data-item"><span>Presión</span><span>${sv.presion || 'N/A'}</span></div>
                <div class="data-item"><span>Temperatura</span><span>${sv.temperatura || 'N/A'}</span></div>
                <div class="data-item"><span>Frec. Cardíaca</span><span>${sv.frecuencia || 'N/A'}</span></div>
                <div class="data-item"><span>Saturación O₂</span><span>${sv.saturacion || 'N/A'}</span></div>
              </div>
            </li>`;
        });
      }

      if (listEl.innerHTML !== newHTML) {
        listEl.innerHTML = newHTML;
        this.filtrarDoctor();
      }
    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:red;">Error: ' + e.message + '</li>';
    }
  },

  async cambiarEstado(pacienteId, nuevoEstado) {
    if (!Estado.online || !sb) return;
    try {
      const { error } = await sb.from('pacientes_espera')
        .update({ estado: nuevoEstado })
        .eq('id', pacienteId);
      if (error) throw error;
    } catch (e) {
      this.toast('Error al actualizar estado', 'error');
      return;
    }
    if (nuevoEstado === 'en_consulta') this.toast('Paciente llamado', 'success');
    await this.cargarPacientesArea();
  },

  filtrarDoctor() {
    const input = document.getElementById('inputFiltroDoctor');
    if (!input) return;
    const filter = input.value.toLowerCase();
    const items = document.querySelectorAll('#patientList .patient-item');

    items.forEach(item => {
      if (item.innerText.includes('Cargando...') || item.innerText.includes('No hay pacientes')) return;
      const text = item.innerText.toLowerCase();
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  },

  abrirConsulta(pacienteId) {
    if (!Estado.turnosArea) return;
    const paciente = Estado.turnosArea.find(p => p.id === pacienteId);
    if (!paciente) return;

    // Reset visual state
    const formContent = document.getElementById('formConsultaContent');
    const successScreen = document.getElementById('formConsultaSuccess');
    if (formContent) formContent.style.display = 'block';
    if (successScreen) successScreen.style.display = 'none';

    document.getElementById('consultaTurnoId').value = paciente.id;
    document.getElementById('consultaPacienteName').innerText = 'Paciente: ' + paciente.nombre;

    const isFarmacia = Estado.areaId === 'Farmacia';

    const fControls = document.getElementById('farmaciaControls');
    if (fControls) fControls.style.display = isFarmacia ? 'block' : 'none';
    const fNotas = document.getElementById('farmaciaNotas');
    if (fNotas) fNotas.value = '';

    // Bloquear edición si es Farmacia
    const camposFormulario = [
      'consNombre', 'consCedula', 'consCelular', 'consDireccion',
      'consEdad', 'consPeso', 'consEstatura', 'consPresion',
      'consTemperatura', 'consFrecuencia', 'consSaturacion',
      'consDiagnostico', 'consReceta'
    ];
    camposFormulario.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.readOnly = isFarmacia;
        if (isFarmacia) el.style.backgroundColor = 'rgba(0,0,0,0.02)';
        else el.style.backgroundColor = '';
      }
    });

    const btnGuardar = document.getElementById('btnGuardarConsulta');
    if (btnGuardar) {
      if (isFarmacia) {
        btnGuardar.innerText = '✅ Marcar Medicinas Entregadas';
      } else {
        btnGuardar.innerText = '✅ Finalizar Consulta';
      }
    }

    document.getElementById('consNombre').value = paciente.nombre || '';
    document.getElementById('consCedula').value = paciente.cedula || '';
    document.getElementById('consCelular').value = paciente.celular || '';
    document.getElementById('consDireccion').value = paciente.direccion || '';

    let sv = {};
    try { sv = JSON.parse(paciente.signos_vitales || '{}'); } catch (e) { }

    document.getElementById('consEdad').value = sv.edad || '';
    document.getElementById('consPeso').value = sv.peso || '';
    document.getElementById('consEstatura').value = sv.estatura || '';
    document.getElementById('consPresion').value = sv.presion || '';
    document.getElementById('consTemperatura').value = sv.temperatura || '';
    document.getElementById('consFrecuencia').value = sv.frecuencia || '';
    document.getElementById('consSaturacion').value = sv.saturacion || '';

    document.getElementById('consDiagnostico').value = sv.diagnostico || '';
    document.getElementById('consReceta').value = sv.receta || '';

    this.mostrarVista('formConsulta');
  },

  async guardarConsulta() {
    const pacienteId = document.getElementById('consultaTurnoId').value;
    const btn = document.getElementById('btnGuardarConsulta');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    const paciente = Estado.turnosArea.find(p => p.id === pacienteId);
    if (!paciente) {
      this.toast('Error: Paciente no encontrado', 'error');
      btn.disabled = false; btn.innerText = '✅ Finalizar Consulta';
      return;
    }

    let sv = {};
    try { sv = JSON.parse(paciente.signos_vitales || '{}'); } catch (e) { }

    sv.edad = document.getElementById('consEdad').value;
    sv.peso = document.getElementById('consPeso').value;
    sv.estatura = document.getElementById('consEstatura').value;
    sv.presion = document.getElementById('consPresion').value;
    sv.temperatura = document.getElementById('consTemperatura').value;
    sv.frecuencia = document.getElementById('consFrecuencia').value;
    sv.saturacion = document.getElementById('consSaturacion').value;

    sv.diagnostico = document.getElementById('consDiagnostico').value.trim();
    const recetaTexto = document.getElementById('consReceta').value.trim();

    let codigoReceta = null;
    const isFarmacia = Estado.areaId === 'Farmacia';

    if (isFarmacia) {
      const checkedOpt = document.querySelector('input[name="estado_entrega"]:checked');
      if (checkedOpt) sv.farmacia_entrega = checkedOpt.value;
      const fNotas = document.getElementById('farmaciaNotas');
      if (fNotas) sv.farmacia_notas = fNotas.value.trim();
    }

    // Solo los doctores (no Farmacia) pueden generar nuevas recetas y enviar a Farmacia
    if (recetaTexto && !isFarmacia) {
      // Generar código único de receta de SOLO 4 NÚMEROS (Ej: 4921)
      codigoReceta = Math.floor(1000 + Math.random() * 9000).toString();
      sv.receta = recetaTexto;
      sv.codigo_receta = codigoReceta;
    }

    try {
      // 1. Actualizar paciente actual y marcarlo como atendido
      const nombreFinal = document.getElementById('consNombre').value.trim();
      const cedulaFinal = document.getElementById('consCedula').value.trim();
      const celularFinal = document.getElementById('consCelular').value.trim();
      const direccionFinal = document.getElementById('consDireccion').value.trim();

      const { error: err1 } = await sb.from('pacientes_espera')
        .update({
          estado: 'atendido',
          nombre: nombreFinal,
          cedula: cedulaFinal,
          celular: celularFinal,
          direccion: direccionFinal,
          signos_vitales: JSON.stringify(sv)
        })
        .eq('id', pacienteId);
      if (err1) throw err1;

      // 2. Si hay receta y NO somos Farmacia, enviar a Farmacia creando un nuevo turno
      if (recetaTexto && !isFarmacia) {

        // Calcular turno de farmacia
        const { data: maxData } = await sb.from('pacientes_espera')
          .select('numero_turno_area')
          .eq('especialidad', 'Farmacia')
          .not('numero_turno_area', 'is', null)
          .order('numero_turno_area', { ascending: false })
          .limit(1);

        let numTurnoFarmacia = 1;
        if (maxData && maxData.length > 0 && maxData[0].numero_turno_area) {
          numTurnoFarmacia = maxData[0].numero_turno_area + 1;
        }

        const { error: err2 } = await sb.from('pacientes_espera').insert({
          nombre: `[Receta: ${codigoReceta}] ${nombreFinal}`,
          cedula: cedulaFinal,
          celular: celularFinal,
          direccion: direccionFinal,
          especialidad: 'Farmacia',
          numero_turno_area: numTurnoFarmacia,
          creado_por: Estado.userName,
          atendido_por: 'Enviado desde ' + Estado.areaId,
          estado: 'pendiente', // Aparece directo en la lista de Farmacia
          signos_vitales: JSON.stringify(sv)
        });
        if (err2) throw err2;

        // Mostrar pantalla de éxito con el código (no cerramos la vista aún)
        const formContent = document.getElementById('formConsultaContent');
        const successScreen = document.getElementById('formConsultaSuccess');
        const codeDisplay = document.getElementById('consultaCodigoGenerado');

        if (formContent && successScreen && codeDisplay) {
          formContent.style.display = 'none';
          codeDisplay.innerText = codigoReceta;
          successScreen.style.display = 'block';
        } else {
          this.toast(`✅ Consulta finalizada. Receta ${codigoReceta} enviada a Farmacia.`, 'success');
          this.mostrarVista('misPacientes');
        }
      } else {
        if (isFarmacia) {
          this.toast('✅ Medicamentos entregados. Turno finalizado.', 'success');
        } else {
          this.toast('✅ Consulta finalizada exitosamente.', 'success');
        }
        this.mostrarVista('misPacientes');
      }

      await this.cargarPacientesArea();
    } catch (e) {
      console.error(e);
      this.toast('Error: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerText = '✅ Finalizar Consulta';
  },

  cerrarPantallaExitoConsulta() {
    this.mostrarVista('misPacientes');
  },

  descargarRecetaPDF() {
    const btn = document.querySelector('#formConsultaSuccess button.btn-large');
    const originalText = btn.innerText;
    btn.innerText = 'Generando PDF...';
    btn.disabled = true;

    const pacienteNombre = document.getElementById('consNombre').value.trim();
    const pacienteCedula = document.getElementById('consCedula').value.trim();
    const diagnostico = document.getElementById('consDiagnostico').value.trim();
    const receta = document.getElementById('consReceta').value.trim();
    const codigo = document.getElementById('consultaCodigoGenerado').innerText;
    const fecha = new Date().toLocaleDateString('es-EC');

    const div = document.createElement('div');
    div.style.cssText = 'padding: 40px; font-family: Arial, sans-serif; color: #333; background: #fff; line-height: 1.6; position: absolute; left: -9999px; width: 800px;';

    div.innerHTML = `
      <div style="text-align: center; border-bottom: 2px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="color: #0ea5e9; margin: 0; font-size: 28px;">RENOVACIÓN MONTUFAREÑA</h1>
        <p style="margin: 5px 0 0; font-size: 14px; color: #64748b;">Unidad de Salud y Atención Integral</p>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px;">
        <div>
          <p style="margin: 0;"><strong>Paciente:</strong> ${pacienteNombre}</p>
          <p style="margin: 5px 0 0;"><strong>Cédula:</strong> ${pacienteCedula}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0;"><strong>Fecha:</strong> ${fecha}</p>
          <p style="margin: 5px 0 0;"><strong>Código Receta:</strong> <span style="color: #0ea5e9; font-weight: bold;">${codigo}</span></p>
        </div>
      </div>
      ${diagnostico ? `
      <div style="margin-bottom: 20px;">
        <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #0ea5e9;">Diagnóstico / Observaciones</h3>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">${diagnostico}</div>
      </div>` : ''}
      <div>
        <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 16px; color: #10b981;">Receta Médica (Rp.)</h3>
        <div style="border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; font-size: 14px; white-space: pre-wrap; min-height: 150px;">${receta}</div>
      </div>
      <div style="margin-top: 80px; text-align: center;">
        <div style="border-top: 1px solid #94a3b8; width: 250px; margin: 0 auto; padding-top: 10px;">
          <p style="margin: 0; font-weight: bold;">Firma del Médico</p>
          <p style="margin: 0; font-size: 12px; color: #64748b;">${Estado.userName} - ${Estado.areaId}</p>
        </div>
      </div>
      <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8;">
        Documento generado automáticamente por el Sistema de Turnos.
      </div>
    `;

    document.body.appendChild(div);

    const opt = {
      margin: 10,
      filename: `Receta_${pacienteNombre.replace(/ /g, '_')}_${fecha.replace(/\//g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(div).save().then(() => {
      document.body.removeChild(div);
      btn.innerText = originalText;
      btn.disabled = false;
      this.toast('✅ PDF generado correctamente', 'success');
    }).catch(e => {
      console.error(e);
      document.body.removeChild(div);
      btn.innerText = originalText;
      btn.disabled = false;
      this.toast('Error generando PDF', 'error');
    });
  },

  // ---- EXPORTAR EXCEL ----
  descargarExcel() {
    // Mostrar modal de selección de especialidad
    this._mostrarModalExcel();
  },

  _mostrarModalExcel() {
    const prev = document.getElementById('modalExcelExport');
    if (prev) prev.remove();

    const especialidades = ['TODAS LAS ESPECIALIDADES', ...AREAS_ESTATICAS];

    // Construir opciones de especialidad como <option> de un <select>
    const opcionesEsp = especialidades.map((esp, i) =>
      `<option value="${esp}">${i === 0 ? '\u2605 ' + esp : esp}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'modalExcelExport';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      display:flex;align-items:center;justify-content:center;
      padding:1rem;
      background:rgba(10,15,30,0.65);
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      animation:fadeIn .2s ease;
    `;

    modal.innerHTML = `
      <div style="
        background:#fff;
        border-radius:20px;
        width:100%;max-width:480px;
        box-shadow:0 24px 64px rgba(0,0,0,0.25);
        overflow:hidden;
        animation:slideUp .3s cubic-bezier(.16,1,.3,1);
        font-family:'Outfit',sans-serif;
      ">

        <!-- Cabecera verde -->
        <div style="
          background:linear-gradient(135deg,#10b981,#059669);
          padding:1.5rem 1.75rem;
          display:flex;align-items:center;gap:1rem;
        ">
          <div style="
            width:48px;height:48px;
            background:rgba(255,255,255,0.2);
            border-radius:12px;
            display:flex;align-items:center;justify-content:center;
            font-size:1.5rem;flex-shrink:0;
          ">📊</div>
          <div style="flex:1;">
            <div style="color:#fff;font-size:1.25rem;font-weight:800;letter-spacing:-.02em;">Exportar a Excel</div>
            <div style="color:rgba(255,255,255,.75);font-size:.85rem;margin-top:2px;">Elige la especialidad y tipo de pacientes</div>
          </div>
          <button onclick="app._cerrarModalExcel()" style="
            background:rgba(255,255,255,.2);border:none;
            width:32px;height:32px;border-radius:50%;
            color:#fff;font-size:1rem;cursor:pointer;
            display:flex;align-items:center;justify-content:center;
            transition:background .2s;font-family:inherit;
          " onmouseover="this.style.background='rgba(255,255,255,.35)'" onmouseout="this.style.background='rgba(255,255,255,.2)'">✕</button>
        </div>

        <!-- Cuerpo -->
        <div style="padding:1.5rem 1.75rem;display:flex;flex-direction:column;gap:1.25rem;">

          <!-- Especialidad -->
          <div>
            <label style="
              display:block;font-size:.78rem;font-weight:700;
              text-transform:uppercase;letter-spacing:.08em;
              color:#64748b;margin-bottom:.5rem;
            ">🏥 Especialidad</label>
            <select id="excelSelectEsp" style="
              width:100%;padding:.75rem 1rem;
              border:1.5px solid #e2e8f0;border-radius:12px;
              font-size:.95rem;font-family:'Outfit',sans-serif;
              color:#0f172a;background:#f8fafc;
              outline:none;cursor:pointer;
              transition:border-color .2s;
            " onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#e2e8f0'">
              ${opcionesEsp}
            </select>
          </div>

          <!-- Filtro de pacientes -->
          <div>
            <label style="
              display:block;font-size:.78rem;font-weight:700;
              text-transform:uppercase;letter-spacing:.08em;
              color:#64748b;margin-bottom:.6rem;
            ">👥 Pacientes a incluir</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;">

              <label id="chip-todos" onclick="app._selChip(this)" style="
                display:flex;flex-direction:column;align-items:center;gap:.35rem;
                padding:.85rem .5rem;border-radius:12px;cursor:pointer;
                border:2px solid #4f46e5;background:#ede9fe;
                transition:all .2s;text-align:center;
              ">
                <input type="radio" name="excelFiltro" value="todos" checked style="display:none">
                <span style="font-size:1.4rem;">📋</span>
                <span style="font-size:.75rem;font-weight:700;color:#4338ca;line-height:1.3;">Todos<br><span style="font-weight:500;color:#6d28d9;">(lista + atendidos)</span></span>
              </label>

              <label id="chip-lista" onclick="app._selChip(this)" style="
                display:flex;flex-direction:column;align-items:center;gap:.35rem;
                padding:.85rem .5rem;border-radius:12px;cursor:pointer;
                border:2px solid #e2e8f0;background:#fff;
                transition:all .2s;text-align:center;
              ">
                <input type="radio" name="excelFiltro" value="lista" style="display:none">
                <span style="font-size:1.4rem;">⏳</span>
                <span style="font-size:.75rem;font-weight:700;color:#64748b;line-height:1.3;">Solo lista<br><span style="font-weight:500;">(pendientes)</span></span>
              </label>

              <label id="chip-atendidos" onclick="app._selChip(this)" style="
                display:flex;flex-direction:column;align-items:center;gap:.35rem;
                padding:.85rem .5rem;border-radius:12px;cursor:pointer;
                border:2px solid #e2e8f0;background:#fff;
                transition:all .2s;text-align:center;
              ">
                <input type="radio" name="excelFiltro" value="atendidos" style="display:none">
                <span style="font-size:1.4rem;">✅</span>
                <span style="font-size:.75rem;font-weight:700;color:#64748b;line-height:1.3;">Solo<br><span style="font-weight:500;">atendidos</span></span>
              </label>

            </div>
          </div>

          <!-- Botones -->
          <div style="display:flex;gap:.75rem;padding-top:.5rem;border-top:1px solid #f1f5f9;">
            <button onclick="app._ejecutarDescargaExcel()" style="
              flex:1;padding:.85rem 1rem;
              background:linear-gradient(135deg,#10b981,#059669);
              color:#fff;border:none;border-radius:12px;
              font-size:1rem;font-weight:700;font-family:'Outfit',sans-serif;
              cursor:pointer;transition:all .2s;
              box-shadow:0 6px 20px rgba(16,185,129,0.35);
              display:flex;align-items:center;justify-content:center;gap:.5rem;
            " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 10px 28px rgba(16,185,129,.45)'" onmouseout="this.style.transform='';this.style.boxShadow='0 6px 20px rgba(16,185,129,.35)'">
              <span style="font-size:1.1rem;">📥</span> Descargar Excel
            </button>
            <button onclick="app._cerrarModalExcel()" style="
              padding:.85rem 1.25rem;
              background:#f1f5f9;color:#64748b;
              border:1.5px solid #e2e8f0;border-radius:12px;
              font-size:.95rem;font-weight:600;font-family:'Outfit',sans-serif;
              cursor:pointer;transition:all .2s;
            " onmouseover="this.style.background='#e2e8f0';this.style.color='#334155'" onmouseout="this.style.background='#f1f5f9';this.style.color='#64748b'">Cancelar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  _selChip(labelEl) {
    // Deseleccionar todos los chips
    ['chip-todos', 'chip-lista', 'chip-atendidos'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.border = '2px solid #e2e8f0';
      el.style.background = '#fff';
      const span = el.querySelector('span:last-child');
      if (span) span.style.color = '#64748b';
    });
    // Marcar el seleccionado
    labelEl.style.border = '2px solid #4f46e5';
    labelEl.style.background = '#ede9fe';
    const span = labelEl.querySelector('span:last-child');
    if (span) span.style.color = '#4338ca';
    // Marcar el radio
    const radio = labelEl.querySelector('input[type=radio]');
    if (radio) radio.checked = true;
  },

  _cerrarModalExcel() {
    const modal = document.getElementById('modalExcelExport');
    if (modal) modal.remove();
  },

  async _ejecutarDescargaExcel() {
    if (!Estado.online || !sb) {
      this.toast('Sin conexión a base de datos', 'error');
      this._cerrarModalExcel();
      return;
    }

    const especialidadSel = document.getElementById('excelSelectEsp')?.value || 'TODAS LAS ESPECIALIDADES';
    const filtroSel = document.querySelector('input[name="excelFiltro"]:checked')?.value || 'todos';

    this._cerrarModalExcel();
    this.toast('⏳ Generando reporte Excel...', 'success');

    try {
      let query = sb.from('pacientes_espera').select('*');

      // Filtrar por especialidad
      if (especialidadSel !== 'TODAS LAS ESPECIALIDADES') {
        query = query.eq('especialidad', especialidadSel);
      }

      // Filtrar por estado
      if (filtroSel === 'lista') {
        query = query.in('estado', ['en_espera', 'pendiente', 'en_consulta']);
      } else if (filtroSel === 'atendidos') {
        query = query.eq('estado', 'atendido');
      }
      // 'todos' → sin filtro adicional de estado

      query = query.order('especialidad', { ascending: true }).order('created_at', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        this.toast('No hay datos para exportar con ese filtro', 'error');
        return;
      }

      // Mapeo de estado legible
      const estadoLabel = (e) => {
        const map = { 'en_espera': 'En Espera', 'pendiente': 'Pendiente', 'en_consulta': 'En Consulta', 'atendido': 'Atendido' };
        return map[e] || e || '';
      };

      // Encabezados
      const headers = [
        'Fecha y Hora', 'Nombre Completo', 'Cédula', 'Celular', 'Dirección',
        'Especialidad', 'Turno', 'Estado', 'Registrado Por', 'Atendido Por (Triaje)',
        'Edad', 'Peso', 'Estatura', 'Presión Arterial', 'Temperatura',
        'Frecuencia Cardíaca', 'Saturación O2', 'Diagnóstico'
      ];

      const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

      let csvRows = [headers.map(escapeCsv).join(',')];

      data.forEach(t => {
        let sv = {};
        try { sv = JSON.parse(t.signos_vitales || '{}'); } catch (e) { }

        const fechaStr = t.created_at ? new Date(t.created_at).toLocaleString('es-EC') : '';
        const turnoStr = t.numero_turno_area
          ? `${(t.especialidad || '').substring(0, 3).toUpperCase()}-${t.numero_turno_area}`
          : 'N/A';

        const row = [
          fechaStr,
          t.nombre || '',
          t.cedula || '',
          t.celular || '',
          t.direccion || '',
          t.especialidad || '',
          turnoStr,
          estadoLabel(t.estado),
          t.creado_por || '',
          t.atendido_por || '',
          sv.edad || '',
          sv.peso || '',
          sv.estatura || '',
          sv.presion || '',
          sv.temperatura || '',
          sv.frecuencia || '',
          sv.saturacion || '',
          sv.diagnostico || ''
        ];

        csvRows.push(row.map(escapeCsv).join(','));
      });

      // BOM para compatibilidad UTF-8 con Excel
      const BOM = '\uFEFF';
      const csvContent = BOM + csvRows.join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const espNombre = especialidadSel === 'TODAS LAS ESPECIALIDADES' ? 'Todas' : especialidadSel.replace(/ /g, '_');
      const filtroNombre = filtroSel === 'todos' ? 'Todos' : filtroSel === 'lista' ? 'EnLista' : 'Atendidos';
      link.href = url;
      link.download = `Reporte_${espNombre}_${filtroNombre}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.toast(`✅ Excel descargado: ${data.length} pacientes`, 'success');

    } catch (err) {
      console.error(err);
      this.toast('Error al exportar: ' + err.message, 'error');
    }
  },

  // ============================================================
  // HISTORIA CLÍNICA
  // ============================================================

  abrirHistoriaClinica() {
    document.getElementById('inputBuscarHistoria').value = '';
    document.getElementById('historiaClinicaResults').style.display = 'none';
    document.getElementById('historiaClinicaEmpty').style.display = 'block';
    document.getElementById('historiaClinicaLoading').style.display = 'none';
    this.mostrarVista('historiaClinica');
  },

  async buscarHistoriaClinica() {
    const termino = document.getElementById('inputBuscarHistoria').value.trim();
    if (!termino) {
      this.toast('Por favor, ingresa una cédula o nombre para buscar', 'error');
      return;
    }

    const btn = document.querySelector('#view-historiaClinica button.btn-success');
    if (btn) btn.disabled = true;

    document.getElementById('historiaClinicaEmpty').style.display = 'none';
    document.getElementById('historiaClinicaResults').style.display = 'none';
    document.getElementById('historiaClinicaLoading').style.display = 'block';

    try {
      if (!Estado.online || !sb) throw new Error('Sin conexión a Base de Datos');

      // Buscar por cédula o nombre (ilike)
      const { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .or(`cedula.ilike.%${termino}%,nombre.ilike.%${termino}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.renderizarHistoriaClinica(data, termino);

    } catch (e) {
      console.error(e);
      this.toast('Error al buscar historial: ' + e.message, 'error');
      document.getElementById('historiaClinicaLoading').style.display = 'none';
      document.getElementById('historiaClinicaEmpty').style.display = 'block';
    }

    if (btn) btn.disabled = false;
  },

  renderizarHistoriaClinica(registros, termino) {
    document.getElementById('historiaClinicaLoading').style.display = 'none';
    const container = document.getElementById('historiaClinicaResults');

    if (!registros || registros.length === 0) {
      container.innerHTML = `
        <div class="state-empty" style="padding: 2rem;">
           <span class="state-empty-icon">🔍</span>
           <span class="state-empty-text">No se encontró historial para "${termino}"</span>
        </div>`;
      container.style.display = 'block';
      return;
    }

    // El primer registro (más reciente) usaremos para datos generales del paciente
    const p = registros[0];

    // Generar timeline de visitas
    let visitasHTML = '';

    registros.forEach((reg) => {
      let sv = {};
      try { sv = JSON.parse(reg.signos_vitales || '{}'); } catch (e) { }

      const fecha = new Date(reg.created_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

      const estadoClases = {
        'atendido': 'background: var(--success); color: white;',
        'en_consulta': 'background: var(--primary); color: white;',
        'en_espera': 'background: #f59e0b; color: white;',
        'pendiente': 'background: #f59e0b; color: white;'
      };
      const estadoBadge = `<span style="padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; ${estadoClases[reg.estado] || 'background: #cbd5e1; color: #334155;'}">${(reg.estado || '').toUpperCase()}</span>`;

      visitasHTML += `
        <div style="border-left: 3px solid var(--primary); margin-left: 1rem; padding-left: 1.5rem; padding-bottom: 2rem; position: relative;">
          <div style="position: absolute; left: -11px; top: 0; width: 18px; height: 18px; background: white; border: 3px solid var(--primary); border-radius: 50%;"></div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; margin-top: -5px;">
            <strong style="font-size: 1.1rem; color: var(--text-color);">${fecha}</strong>
            ${estadoBadge}
          </div>
          <div style="background: var(--bg); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-top: 0.5rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Área / Especialidad</div>
                <div style="font-weight: 600;">${reg.especialidad || 'N/A'} ${reg.numero_turno_area ? '(Turno ' + reg.numero_turno_area + ')' : ''}</div>
              </div>
              <div>
                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Atendido Por</div>
                <div style="font-weight: 600;">${reg.atendido_por || 'N/A'}</div>
              </div>
            </div>
            
            ${Object.keys(sv).length > 0 ? `
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Signos Vitales</div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; background: white; padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color);">
                ${sv.edad ? `<span style="font-size: 0.85rem;"><strong>Edad:</strong> ${sv.edad}</span>` : ''}
                ${sv.peso ? `<span style="font-size: 0.85rem;"><strong>Peso:</strong> ${sv.peso}</span>` : ''}
                ${sv.estatura ? `<span style="font-size: 0.85rem;"><strong>Est:</strong> ${sv.estatura}</span>` : ''}
                ${sv.presion ? `<span style="font-size: 0.85rem;"><strong>PA:</strong> ${sv.presion}</span>` : ''}
                ${sv.temperatura ? `<span style="font-size: 0.85rem;"><strong>Temp:</strong> ${sv.temperatura}</span>` : ''}
                ${sv.frecuencia ? `<span style="font-size: 0.85rem;"><strong>FC:</strong> ${sv.frecuencia}</span>` : ''}
                ${sv.saturacion ? `<span style="font-size: 0.85rem;"><strong>SatO2:</strong> ${sv.saturacion}</span>` : ''}
              </div>
            ` : '<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; font-style: italic;">No hay signos vitales registrados</div>'}

            ${sv.diagnostico ? `
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Diagnóstico / Observaciones</div>
              <div style="background: rgba(14, 165, 233, 0.05); padding: 0.75rem; border-radius: 6px; font-size: 0.9rem; margin-bottom: 1rem; border: 1px solid rgba(14, 165, 233, 0.2); white-space: pre-wrap;">${sv.diagnostico}</div>
            ` : ''}

            ${sv.receta ? `
              <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Receta Médica ${sv.codigo_receta ? '(Cód: ' + sv.codigo_receta + ')' : ''}</div>
              <div style="background: rgba(16, 185, 129, 0.05); padding: 0.75rem; border-radius: 6px; font-size: 0.9rem; border: 1px solid rgba(16, 185, 129, 0.2); white-space: pre-wrap;">${sv.receta}</div>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div style="margin-bottom: 2rem; background: var(--bg); padding: 1.5rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
        <h3 style="margin-bottom: 1rem; color: var(--primary); display: flex; justify-content: space-between; align-items: center;">
          <span>👤 Perfil del Paciente</span>
          <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">${registros.length} atención(es) registrada(s)</span>
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Nombres y Apellidos</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${p.nombre || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Número de Cédula</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${p.cedula || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Número de Celular</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${p.celular || 'N/A'}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Dirección</div>
            <div style="font-size: 1.1rem; font-weight: 600;">${p.direccion || 'N/A'}</div>
          </div>
        </div>
      </div>
      
      <h3 style="margin-bottom: 1.5rem;">📅 Línea de Tiempo de Atenciones</h3>
      <div style="padding-top: 10px;">
        ${visitasHTML}
      </div>
    `;

    container.style.display = 'block';
  },

  // ============================================================
  // ROL: ADMIN (Panel de Control de Usuarios)
  // ============================================================

  async adminCargarUsuarios() {
    const listEl = document.getElementById('adminUserList');
    if (!listEl) return;
    listEl.innerHTML = `
      <li>
        <div class="state-empty animate-pulse">
          <span class="state-empty-icon">👤</span>
          <span class="state-empty-text">Cargando usuarios...</span>
        </div>
      </li>`;

    try {
      const { data, error } = await sb.rpc('admin_obtener_usuarios', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      listEl.innerHTML = '';
      const usuarios = data.data || [];
      if (usuarios.length === 0) {
        listEl.innerHTML = `
          <li>
            <div class="state-empty">
              <span class="state-empty-icon">👥</span>
              <span class="state-empty-text">No hay usuarios registrados</span>
            </div>
          </li>`;
        return;
      }

      usuarios.forEach(u => {
        const roleClass = u.role === 'admin' ? 'admin' : (u.role === 'doctor' ? 'doctor' : (u.role === 'enfermera' ? 'enfermera' : 'turnero'));
        listEl.innerHTML += `
          <li class="admin-user-item">
            <div class="admin-user-info">
              <div class="admin-username">@${u.username}${u.username === Estado.userName ? ' <span style="color:#a0aec0;font-size:0.78rem;font-weight:500;">(tú)</span>' : ''}</div>
              <div class="admin-user-meta">
                <span class="role-badge ${roleClass}">${u.role.toUpperCase()}</span>
                ${u.area ? `<span class="area-tag">🏥 ${u.area}</span>` : ''}
              </div>
            </div>
            ${u.username !== Estado.userName
            ? `<button class="btn-action" style="background:var(--danger);" onclick="app.adminEliminarUsuario('${u.id}', '${u.username}')">🗑️ Eliminar</button>`
            : ''}
          </li>`;
      });
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<li><div class="state-empty"><span class="state-empty-icon">❌</span><span class="state-empty-text">Error: ${e.message}</span></div></li>`;
    }
  },

  async adminCrearUsuario() {
    const username = (document.getElementById('adminNewUser').value || '').trim();
    const pass = (document.getElementById('adminNewPass').value || '').trim();
    const role = document.getElementById('adminNewRole').value;
    const area = (document.getElementById('adminNewArea').value || '').trim();

    if (!username || !pass) {
      this.toast('Por favor completa usuario y contraseña', 'error');
      return;
    }
    if (role === 'doctor' && !area) {
      this.toast('El doctor debe tener un área especificada', 'error');
      return;
    }

    try {
      const { data, error } = await sb.rpc('admin_crear_usuario', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass,
        p_new_username: username,
        p_new_password: pass,
        p_new_role: role,
        p_new_area: role === 'doctor' ? area : null
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      this.toast(`Usuario @${username} creado exitosamente`, 'success');
      document.getElementById('adminNewUser').value = '';
      document.getElementById('adminNewPass').value = '';
      if (role === 'doctor') document.getElementById('adminNewArea').value = '';

      this.adminCargarUsuarios();
    } catch (e) {
      console.error(e);
      this.toast('Error: ' + e.message, 'error');
    }
  },

  async adminEliminarUsuario(id, username) {
    if (!confirm(`¿Estás seguro de que deseas ELIMINAR el usuario @${username}?`)) return;

    try {
      const { data, error } = await sb.rpc('admin_eliminar_usuario', {
        p_admin_user: Estado.userName,
        p_admin_pass: Estado.adminPass,
        p_target_id: id
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      this.toast(`Usuario @${username} eliminado`, 'success');
      this.adminCargarUsuarios();
    } catch (e) {
      console.error(e);
      this.toast('Error al eliminar: ' + e.message, 'error');
    }
  },

  // ---- DASHBOARD (ANALYTICS) ----
  abrirDashboard() {
    this.mostrarVista('dashboard');
    this.generarDashboard();
  },

  async generarDashboard() {
    if (!Estado.online || !sb) return;
    try {
      // Obtener todos los turnos del día (la cola actual)
      const { data, error } = await sb.from('pacientes_espera').select('*');
      if (error) throw error;

      const total = data.length;
      const atendidos = data.filter(d => d.estado === 'atendido').length;
      const enEspera = data.filter(d => d.estado === 'en_espera' || d.estado === 'pendiente').length;
      const enConsulta = data.filter(d => d.estado === 'en_consulta').length;

      document.getElementById('dashTotalPacientes').innerText = total;
      document.getElementById('dashTotalAtendidos').innerText = atendidos;
      document.getElementById('dashTotalEspera').innerText = enEspera;

      // Agrupar por áreas
      const areasCount = {};
      data.forEach(d => {
        const area = d.especialidad || 'Desconocido';
        areasCount[area] = (areasCount[area] || 0) + 1;
      });

      this._renderChartAreas(Object.keys(areasCount), Object.values(areasCount));

      // Agrupar por estados
      const estadosCount = { 'Atendido': atendidos, 'En Espera/Pendiente': enEspera, 'En Consulta': enConsulta };
      this._renderChartEstados(Object.keys(estadosCount), Object.values(estadosCount));

    } catch (e) {
      console.error(e);
      this.toast('Error cargando estadísticas', 'error');
    }
  },

  _renderChartAreas(labels, data) {
    const ctx = document.getElementById('chartAreas');
    if (!ctx) return;
    if (window.chartAreasInstance) window.chartAreasInstance.destroy();

    window.chartAreasInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: ['#38bdf8', '#34d399', '#f472b6', '#fbbf24', '#a78bfa', '#94a3b8'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
  },

  _renderChartEstados(labels, data) {
    const ctx = document.getElementById('chartEstados');
    if (!ctx) return;
    if (window.chartEstadosInstance) window.chartEstadosInstance.destroy();

    window.chartEstadosInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Cantidad',
          data: data,
          backgroundColor: ['#10b981', '#f59e0b', '#3b82f6'],
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } }
    });
  },

  // ---- TOAST ----
  // ============================================================
  // HISTORIA CLÍNICA
  // ============================================================
  abrirHistoriaClinica() {
    this.mostrarVista('historiaClinica');
    document.getElementById('historiaClinicaResults').style.display = 'none';
    document.getElementById('historiaClinicaEmpty').style.display = 'block';
    document.getElementById('historiaClinicaLoading').style.display = 'none';
    const input = document.getElementById('inputBuscarHistoria');
    if (input) { input.value = ''; input.focus(); }
  },

  async buscarHistoriaClinica() {
    const query = (document.getElementById('inputBuscarHistoria').value || '').trim();
    if (!query) {
      this.toast('Ingresa una cédula o nombre para buscar', 'error');
      return;
    }
    if (!Estado.online || !sb) {
      this.toast('Sin conexión a la base de datos', 'error');
      return;
    }

    document.getElementById('historiaClinicaEmpty').style.display = 'none';
    document.getElementById('historiaClinicaResults').style.display = 'none';
    document.getElementById('historiaClinicaLoading').style.display = 'block';

    try {
      // Buscar por cédula exacta primero, luego por nombre parcial
      let { data, error } = await sb.from('pacientes_espera')
        .select('*')
        .eq('cedula', query)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Si no hay resultado por cédula, buscar por nombre
      if (!data || data.length === 0) {
        const resp = await sb.from('pacientes_espera')
          .select('*')
          .ilike('nombre', `%${query}%`)
          .order('created_at', { ascending: false })
          .limit(50);
        if (resp.error) throw resp.error;
        data = resp.data;
      }

      document.getElementById('historiaClinicaLoading').style.display = 'none';
      this.renderizarHistoriaClinica(data || [], query);

    } catch (e) {
      console.error(e);
      document.getElementById('historiaClinicaLoading').style.display = 'none';
      document.getElementById('historiaClinicaEmpty').style.display = 'block';
      this.toast('Error en la búsqueda: ' + e.message, 'error');
    }
  },

  renderizarHistoriaClinica(registros, query) {
    const container = document.getElementById('historiaClinicaResults');
    if (!registros || registros.length === 0) {
      document.getElementById('historiaClinicaEmpty').querySelector('.state-empty-text').innerText =
        `No se encontraron registros para "${query}"`;
      document.getElementById('historiaClinicaEmpty').style.display = 'block';
      return;
    }

    // Agrupar por paciente (cédula o nombre)
    const pacientes = {};
    registros.forEach(r => {
      const key = r.cedula || r.nombre;
      if (!pacientes[key]) {
        pacientes[key] = { nombre: r.nombre, cedula: r.cedula, celular: r.celular, direccion: r.direccion, visitas: [] };
      }
      // Mantener el nombre más limpio (sin prefijos)
      if (!r.nombre.startsWith('[')) pacientes[key].nombre = r.nombre;
      if (r.celular) pacientes[key].celular = r.celular;
      if (r.direccion) pacientes[key].direccion = r.direccion;
      pacientes[key].visitas.push(r);
    });

    let html = '';
    Object.values(pacientes).forEach(pac => {
      const totalVisitas = pac.visitas.length;
      const ultimaVisita = pac.visitas[0];
      const sv = (() => { try { return JSON.parse(ultimaVisita.signos_vitales || '{}'); } catch (e) { return {}; } })();

      html += `
        <div style="border: 1.5px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 2rem; overflow: hidden;">
          <!-- Cabecera del paciente -->
          <div style="background: linear-gradient(135deg, var(--primary), #0369a1); color: white; padding: 1.5rem 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
              <div>
                <h3 style="margin: 0 0 0.25rem; font-size: 1.4rem; font-weight: 800;">${pac.nombre}</h3>
                <p style="margin: 0; opacity: 0.85; font-size: 0.9rem;">
                  🪪 Cédula: <strong>${pac.cedula || 'N/A'}</strong>
                  &nbsp;|&nbsp; 📱 ${pac.celular || 'N/A'}
                  &nbsp;|&nbsp; 📍 ${pac.direccion || 'N/A'}
                </p>
              </div>
              <div style="text-align: right; opacity: 0.9;">
                <div style="font-size: 1.6rem; font-weight: 800;">${totalVisitas}</div>
                <div style="font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px;">Atenciones</div>
              </div>
            </div>
          </div>

          <!-- Última ficha -->
          ${sv.edad || sv.peso ? `
          <div style="background: var(--bg); padding: 1.25rem 2rem; border-bottom: 1px solid var(--border);">
            <h4 style="margin: 0 0 0.75rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">Última Ficha Médica</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem;">
              ${sv.edad ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.edad}</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Edad</div></div>` : ''}
              ${sv.peso ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.peso} kg</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Peso</div></div>` : ''}
              ${sv.estatura ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.estatura}</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Estatura</div></div>` : ''}
              ${sv.presion ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.presion}</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Presión</div></div>` : ''}
              ${sv.temperatura ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.temperatura}°C</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Temperatura</div></div>` : ''}
              ${sv.saturacion ? `<div style="text-align:center; background: var(--surface-solid); padding: 0.75rem; border-radius: var(--radius-md);"><div style="font-size: 1.3rem; font-weight: 700; color: var(--primary);">${sv.saturacion}%</div><div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">SpO₂</div></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Timeline de visitas -->
          <div style="padding: 1.5rem 2rem;">
            <h4 style="margin: 0 0 1rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">Línea de Tiempo de Atenciones</h4>
            <div style="position: relative; padding-left: 1.5rem; border-left: 2px solid var(--border);">
              ${pac.visitas.map(v => {
        const svV = (() => { try { return JSON.parse(v.signos_vitales || '{}'); } catch (e) { return {}; } })();
        const fecha = v.created_at ? new Date(v.created_at).toLocaleString('es-EC') : 'Fecha desconocida';
        const nombreLimpio = v.nombre.startsWith('[') ? v.nombre.replace(/^\[.*?\]\s*/, '') : v.nombre;
        return `
                  <div style="margin-bottom: 1.5rem; position: relative;">
                    <div style="position: absolute; left: -1.9rem; top: 0.3rem; width: 12px; height: 12px; border-radius: 50%; background: var(--primary);"></div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.3rem;">${fecha}</div>
                    <div style="font-weight: 700; color: var(--text-dark);">
                      ${v.especialidad || 'N/A'}
                      <span style="font-weight: 400; color: var(--text-muted);">— Atendido por: ${v.atendido_por || v.creado_por || 'N/A'}</span>
                    </div>
                    ${svV.diagnostico ? `<div style="margin-top: 0.5rem; font-size: 0.88rem; background: rgba(0,0,0,0.03); padding: 0.6rem 1rem; border-radius: 8px; border-left: 3px solid var(--primary);"><strong>Dx:</strong> ${svV.diagnostico}</div>` : ''}
                    ${svV.receta ? `<div style="margin-top: 0.4rem; font-size: 0.85rem; background: rgba(16,185,129,0.05); padding: 0.6rem 1rem; border-radius: 8px; border-left: 3px solid var(--success);"><strong>Receta:</strong> ${svV.receta}</div>` : ''}
                    ${svV.farmacia_entrega ? `<div style="margin-top: 0.3rem; font-size: 0.8rem; color: var(--text-muted);">💊 Farmacia: <strong>${svV.farmacia_entrega}</strong>${svV.farmacia_notas ? ' — ' + svV.farmacia_notas : ''}</div>` : ''}
                  </div>`;
      }).join('')}
            </div>
          </div>
        </div>`;
    });

    container.innerHTML = html;
    container.style.display = 'block';
  },

  toast(msg, tipo) {
    tipo = tipo || 'success';
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.innerText = msg;
    c.appendChild(t);
    setTimeout(() => { if (c.contains(t)) c.removeChild(t); }, 3500);
  }
};

// ============================================================
// ARRANQUE
// ============================================================
function arrancarApp() {
  app.init();

  document.getElementById('btnRoleDoctor')?.addEventListener('click', () => app.selectRole('doctor'));
  document.getElementById('btnRoleEnfermera')?.addEventListener('click', () => app.selectRole('enfermera'));
  document.getElementById('btnRoleTurnero')?.addEventListener('click', () => app.selectRole('turnero'));

  document.getElementById('btnIngresarTurnero')?.addEventListener('click', () => app.loginTurnero());
  document.getElementById('btnIngresarEnfermera')?.addEventListener('click', () => app.loginEnfermera());
  document.getElementById('btnIngresarDoctor')?.addEventListener('click', () => app.loginDoctor());

  document.getElementById('userNameInput')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') app.loginTurnero();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarApp);
} else {
  arrancarApp();
}

window.app = app;
