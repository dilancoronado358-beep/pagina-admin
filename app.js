// ============================================================
// CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tmucjycefiyhthgoladq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GRERFbwae5xPLjMPG55zXA_Z2GWb3qB';
let sb = null; // cliente Supabase

// ============================================================
// LISTA ESTÁTICA DE PROFESIONALES (respaldo si la BD está vacía)
// ============================================================
const DOCTORES_ESTATICOS = [
  { id: 'doc-1',  nombre: 'Dr. Fabián Robles',        especialidad: 'Odontólogo' },
  { id: 'doc-2',  nombre: 'Dra. Giselle Benavides',   especialidad: 'Odontóloga' },
  { id: 'doc-3',  nombre: 'Dra. Cristina Robles',     especialidad: 'Odontóloga' },
  { id: 'doc-4',  nombre: 'Dr. Santiago Lara',         especialidad: 'Odontólogo' },
  { id: 'doc-5',  nombre: 'Dra. Patricia Tana',        especialidad: 'Odontóloga' },
  { id: 'doc-6',  nombre: 'Dra. Gina Mamani Marca',   especialidad: 'Urología' },
  { id: 'doc-7',  nombre: 'Dr. Klever Moreno',         especialidad: 'Imagenología' },
  { id: 'doc-8',  nombre: 'Dr. Norkis Mosquera',       especialidad: 'Traumatología' },
  { id: 'doc-9',  nombre: 'Dr. Rafael Gordillo',       especialidad: 'Traumatología' },
  { id: 'doc-10', nombre: 'Dr. Álvaro Zúñiga',         especialidad: 'Pediatra' },
  { id: 'doc-11', nombre: 'Dr. Darwin Pinchao',        especialidad: 'Médico General' },
  { id: 'doc-12', nombre: 'Dr. Willian Sinche',        especialidad: 'Médico General' },
  { id: 'doc-13', nombre: 'Dra. Katia Torres',         especialidad: 'Médico General' },
  { id: 'doc-14', nombre: 'Dr. Ferman Moreno',         especialidad: 'Médico General' },
  { id: 'doc-15', nombre: 'Dra. Joselyn Realpe',       especialidad: 'Médico General' },
  { id: 'doc-16', nombre: 'Dra. Wendy Padilla',        especialidad: 'Médico General' },
  { id: 'doc-17', nombre: 'Dr. Carlos Chamorro',       especialidad: 'Médico General' },
  { id: 'doc-18', nombre: 'Dr. Samir Chuga',           especialidad: 'Médico General' },
  { id: 'doc-19', nombre: 'Dr. Francisco Rosales',     especialidad: 'Médico General' },
  { id: 'doc-20', nombre: 'Dr. Diego Pupiales',        especialidad: 'Médico General' },
  { id: 'doc-21', nombre: 'Dra. Jessica Paspuel',      especialidad: 'Médico General' },
  { id: 'doc-22', nombre: 'Lic. Jimmy Torres',          especialidad: 'Fisioterapeuta' },
  { id: 'doc-23', nombre: 'Lic. David Enriquez',       especialidad: 'Fisioterapeuta' },
  { id: 'doc-24', nombre: 'Lic. Hady Chamorro',        especialidad: 'Fisioterapeuta' },
  { id: 'doc-25', nombre: 'Lic. Johana Imbaquingo',    especialidad: 'Fisioterapeuta' },
  { id: 'doc-26', nombre: 'Dra. Sulay Meneses',        especialidad: 'Obstetriz' },
  { id: 'doc-27', nombre: 'Dra. Ana Agurto',           especialidad: 'Obstetriz' },
  { id: 'doc-28', nombre: 'Dra. Mishell De la Torre',  especialidad: 'Obstetriz' },
  { id: 'doc-29', nombre: 'Dr. Patricio Hernández',    especialidad: 'Psicólogo Clínico' },
  { id: 'doc-30', nombre: 'Lic. Verónica Pozo',        especialidad: 'Psicología' },
  { id: 'doc-31', nombre: 'Dra. Ana Chávez',           especialidad: 'Psicólogo Clínico' },
  { id: 'doc-32', nombre: 'Lic. Gabriela Pozo',        especialidad: 'Nutrición' },
  { id: 'doc-33', nombre: 'Lic. Dayana Obando',        especialidad: 'Enfermera' },
  { id: 'doc-34', nombre: 'Lic. Sonia Cangas',         especialidad: 'Enfermera' },
  { id: 'doc-35', nombre: 'Lic. Jessica Muñoz',        especialidad: 'Enfermera' },
  { id: 'doc-36', nombre: 'Lic. Erika Criollo',        especialidad: 'Enfermera' },
  { id: 'doc-37', nombre: 'Lic. Byron Colimba',        especialidad: 'Enfermero' },
  { id: 'doc-38', nombre: 'Tngla. Nicol Landázuri',    especialidad: 'Enfermera' },
  { id: 'doc-39', nombre: 'Lic. Viviana Sánchez',      especialidad: 'Enfermera' },
  { id: 'doc-40', nombre: 'Tnlga. Maritza Moreno',     especialidad: 'Farmacia' }
];

// ============================================================
// ESTADO GLOBAL
// ============================================================
const Estado = {
  role: null,              // 'turnero' | 'doctor'
  userName: '',
  doctorId: null,          // UUID real (de Supabase) o ID local
  doctores: [],            // lista de doctores cargada
  contadores: {},          // doctor_id -> ultimo_turno (para preview de número)
  turnosLocales: [],       // array maestro para modo offline
  online: false            // true si Supabase responde
};

// ============================================================
// OBJETO PRINCIPAL DE LA APP (expuesto globalmente)
// ============================================================
const app = {

  // ------ ARRANQUE ----------------------------------------
  async init() {
    // 1. Cargar lista estática inmediatamente
    Estado.doctores = DOCTORES_ESTATICOS;
    this.llenarSelects();

    // 2. Intentar conectar a Supabase
    try {
      if (!window.supabase) throw new Error('SDK no disponible');
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      // Verificar conexión real intentando leer un turno
      const { error: testErr } = await sb.from('turnos').select('id').limit(1);
      if (testErr) throw new Error('Supabase no responde: ' + testErr.message);

      Estado.online = true;
      console.log('✅ Supabase en línea');

      // 3. Intentar cargar doctores desde la BD
      const { data: docs, error: docsErr } = await sb.from('doctores').select('*').order('nombre');
      if (!docsErr && docs && docs.length > 0) {
        Estado.doctores = docs;
        this.llenarSelects();
        console.log('✅ Doctores cargados de BD:', docs.length);
      } else {
        console.warn('⚠️ Tabla doctores vacía, usando lista local');
      }

    } catch (e) {
      Estado.online = false;
      console.warn('⚠️ Modo offline:', e.message);
    }
  },

  // ------ SELECTS -----------------------------------------
  llenarSelects() {
    ['doctorSelectTurno', 'doctorLoginSelect'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Seleccionar Profesional --</option>';
      Estado.doctores.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.nombre + ' — ' + d.especialidad;
        sel.appendChild(opt);
      });
    });
  },

  // ------ NAVEGACIÓN MODAL --------------------------------
  selectRole(role) {
    document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
    if (role === 'turnero') {
      document.getElementById('step-turnero').classList.add('active');
      setTimeout(() => { const i = document.getElementById('userNameInput'); if(i) i.focus(); }, 100);
    } else {
      document.getElementById('step-doctor').classList.add('active');
    }
  },

  backToRoles() {
    document.querySelectorAll('.login-step').forEach(el => el.classList.remove('active'));
    document.getElementById('step-role').classList.add('active');
  },

  // ------ LOGIN TURNERO -----------------------------------
  async loginTurnero() {
    const nombre = (document.getElementById('userNameInput').value || '').trim();
    if (!nombre) { this.toast('Ingresa tu nombre', 'error'); return; }

    Estado.role = 'turnero';
    Estado.userName = nombre;
    this.cerrarOverlay('📝 Recepción:', nombre);
    this.mostrarVista('darTurno');

    // Cargar contadores de Supabase para saber el próximo número de turno
    if (Estado.online && sb) {
      try {
        const { data } = await sb.from('contadores').select('*');
        if (data) data.forEach(c => { Estado.contadores[c.doctor_id] = c.ultimo_turno; });
      } catch(e) { console.warn('Error cargando contadores', e.message); }
    }
    this.onDoctorSelectTurno();
  },

  // ------ LOGIN DOCTOR ------------------------------------
  async loginDoctor() {
    const sel = document.getElementById('doctorLoginSelect');
    const idSeleccionado = sel.value;
    const textoSeleccionado = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';

    if (!idSeleccionado) { this.toast('Selecciona tu nombre', 'error'); return; }

    // Determinar el UUID real para consultas en Supabase
    let uuidReal = idSeleccionado; // puede ser 'doc-X' (local) o UUID real

    // Si estamos online y el ID parece local (empieza con 'doc-'), buscar UUID real por nombre
    if (Estado.online && sb && idSeleccionado.startsWith('doc-')) {
      try {
        const nombreSolo = textoSeleccionado.split(' — ')[0].trim();
        const { data: found } = await sb
          .from('doctores')
          .select('id, nombre')
          .ilike('nombre', '%' + nombreSolo.replace('Dr. ','').replace('Dra. ','').replace('Lic. ','').replace('Tngla. ','').replace('Tngla. ','') + '%')
          .limit(1);
        if (found && found.length > 0) {
          uuidReal = found[0].id;
          console.log('✅ UUID encontrado:', uuidReal, 'para', nombreSolo);
        }
      } catch(e) { console.warn('No se pudo buscar UUID:', e.message); }
    }

    Estado.role = 'doctor';
    Estado.userName = textoSeleccionado;
    Estado.doctorId = uuidReal;
    this.cerrarOverlay('👨‍⚕️', textoSeleccionado);
    this.mostrarVista('misPacientes');

    await this.cargarPacientes();
  },

  // ------ CERRAR OVERLAY ----------------------------------
  cerrarOverlay(badge, nombre) {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('roleBadge').innerText = badge;
    document.getElementById('displayUserName').innerText = nombre;
    document.getElementById('userInfoDisplay').style.display = 'flex';
  },

  // ------ LOGOUT ------------------------------------------
  logout() {
    Estado.role = null;
    Estado.userName = '';
    Estado.doctorId = null;
    document.getElementById('overlay').style.display = 'flex';
    this.backToRoles();
    document.getElementById('userInfoDisplay').style.display = 'none';
    document.getElementById('userNameInput').value = '';
    document.getElementById('doctorLoginSelect').value = '';
    const st = document.getElementById('doctorSelectTurno');
    if (st) st.value = '';
  },

  // ------ CAMBIAR VISTA -----------------------------------
  mostrarVista(nombre) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const v = document.getElementById('view-' + nombre);
    if (v) v.classList.add('active');
    if (nombre === 'darTurno') {
      this.limpiarFormulario();
      this.onDoctorSelectTurno();
    }
  },

  // ============================================================
  // LÓGICA TURNERO
  // ============================================================

  onDoctorSelectTurno() {
    const docId = document.getElementById('doctorSelectTurno').value;
    const btn = document.getElementById('btnDarTurno');
    const preview = document.getElementById('turnPreview');
    const numEl = document.getElementById('nextTurnNumber');
    if (!docId) {
      if (btn) btn.disabled = true;
      if (preview) preview.style.display = 'none';
      return;
    }
    const ultimo = Estado.contadores[docId] || 0;
    if (numEl) numEl.innerText = '#' + (ultimo + 1);
    if (preview) preview.style.display = 'block';
    if (btn) btn.disabled = false;
  },

  limpiarFormulario() {
    ['pacienteNameInput','pacienteCedula','pacienteEdad','pacientePeso','pacienteEstatura',
     'pacientePresion','pacienteTemperatura','pacienteFrecuencia','pacienteSaturacion',
     'pacienteCelular','pacienteCorreo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  },

  agregarAlHistorial(numero, nombrePaciente, doctorTexto) {
    const lista = document.getElementById('turneroHistoryList');
    if (!lista) return;
    
    // Si es el primero, quitar el mensaje de "vacío"
    if (lista.innerHTML.includes('No has asignado turnos aún')) {
      lista.innerHTML = '';
    }

    const item = document.createElement('li');
    item.className = 'patient-item';
    item.innerHTML = `
      <div class="patient-header">
        <div>
          <div class="patient-title">Turno #${numero} — ${nombrePaciente}</div>
          <div class="patient-subtitle" style="color: #666; font-size: 0.85rem;">Asignado a: ${doctorTexto}</div>
        </div>
        <div style="font-size:1.5rem;">✅</div>
      </div>
    `;
    // Agregar arriba de la lista
    lista.prepend(item);
  },

  async darTurno() {
    const doctorId = document.getElementById('doctorSelectTurno').value;
    if (!doctorId) { this.toast('Selecciona el profesional', 'error'); return; }

    const d = {
      nombre:      (document.getElementById('pacienteNameInput').value || '').trim() || 'Sin Nombre',
      cedula:      (document.getElementById('pacienteCedula').value || '').trim(),
      edad:        (document.getElementById('pacienteEdad').value || '').trim(),
      peso:        (document.getElementById('pacientePeso').value || '').trim(),
      estatura:    (document.getElementById('pacienteEstatura').value || '').trim(),
      presion:     (document.getElementById('pacientePresion').value || '').trim(),
      temperatura: (document.getElementById('pacienteTemperatura').value || '').trim(),
      frecuencia:  (document.getElementById('pacienteFrecuencia').value || '').trim(),
      saturacion:  (document.getElementById('pacienteSaturacion').value || '').trim(),
      celular:     (document.getElementById('pacienteCelular').value || '').trim(),
      correo:      (document.getElementById('pacienteCorreo').value || '').trim(),
    };

    const btn = document.getElementById('btnDarTurno');
    btn.disabled = true;
    btn.innerText = 'Guardando...';

    // Empacar TODOS los datos extra en un JSON dentro de la columna "paciente"
    // Esto garantiza que NO haya errores de columnas faltantes en Supabase
    const extraData = {
      cedula: d.cedula,
      edad: d.edad,
      peso: d.peso,
      estatura: d.estatura,
      presion: d.presion,
      temperatura: d.temperatura,
      frecuencia: d.frecuencia,
      saturacion: d.saturacion,
      celular: d.celular,
      correo: d.correo,
      creado_por: Estado.userName
    };
    
    const pacienteEmpacado = d.nombre + "|||" + JSON.stringify(extraData);

    let numeroTurno = (Estado.contadores[doctorId] || 0) + 1;

    try {
      if (Estado.online && sb) {
        // Obtener y actualizar contador (upsert por si no existe el registro)
        const { data: cRow } = await sb.from('contadores')
          .select('ultimo_turno').eq('doctor_id', doctorId).single();

        if (cRow) {
          numeroTurno = cRow.ultimo_turno + 1;
          await sb.from('contadores')
            .update({ ultimo_turno: numeroTurno })
            .eq('doctor_id', doctorId);
        } else {
          // No existe fila de contador: insertar
          await sb.from('contadores')
            .insert({ doctor_id: doctorId, ultimo_turno: 1 });
          numeroTurno = 1;
        }

        // Insertar turno usando solo las columnas base de Supabase
        const { error: insErr } = await sb.from('turnos').insert({
          doctor_id:      doctorId,
          numero_turno:   numeroTurno,
          paciente:       pacienteEmpacado,
          estado:         'pendiente',
          creado_por:     Estado.userName
        });
        if (insErr) throw insErr;

      } else {
        // Modo offline: guardar en memoria con todos los campos individuales
        Estado.turnosLocales.push({
          id: 'local-' + Date.now(), doctor_id: doctorId, numero_turno: numeroTurno,
          paciente: d.nombre, cedula: d.cedula,
          edad: d.edad, peso: d.peso, estatura: d.estatura,
          presion: d.presion, temperatura: d.temperatura,
          frecuencia: d.frecuencia, saturacion: d.saturacion,
          celular: d.celular, correo: d.correo,
          signos_vitales: signosVitales, contacto: contacto,
          estado: 'pendiente', creado_por: Estado.userName
        });
      }

      Estado.contadores[doctorId] = numeroTurno;
      this.toast('✅ Turno #' + numeroTurno + ' creado', 'success');
      
      const selDoc = document.getElementById('doctorSelectTurno');
      const doctorTexto = selDoc.options[selDoc.selectedIndex].text;
      this.agregarAlHistorial(numeroTurno, d.nombre || 'Sin Nombre', doctorTexto);
      
      this.limpiarFormulario();
      this.onDoctorSelectTurno();

    } catch (err) {
      console.error('Error al crear turno:', err);
      
      // Mostrar el error EXACTO para poder corregirlo
      let msg = err.message || JSON.stringify(err);
      if (err.details) msg += ' | ' + err.details;
      if (err.hint) msg += ' | ' + err.hint;
      alert("ERROR SUPABASE: " + msg + "\n\nPor favor, envíame este mensaje exacto.");

      // Fallback offline
      Estado.turnosLocales.push({
        id: 'local-' + Date.now(), doctor_id: doctorId, numero_turno: numeroTurno,
        paciente: d.nombre, cedula: d.cedula,
        edad: d.edad, peso: d.peso, estatura: d.estatura,
        presion: d.presion, temperatura: d.temperatura,
        frecuencia: d.frecuencia, saturacion: d.saturacion,
        celular: d.celular, correo: d.correo,
        signos_vitales: signosVitales, contacto: contacto,
        estado: 'pendiente', creado_por: Estado.userName
      });
      Estado.contadores[doctorId] = numeroTurno;
      this.toast('Turno #' + numeroTurno + ' guardado (offline)', 'success');
      
      const selDoc = document.getElementById('doctorSelectTurno');
      const doctorTexto = selDoc.options[selDoc.selectedIndex].text;
      this.agregarAlHistorial(numeroTurno, d.nombre || 'Sin Nombre', doctorTexto + ' (Offline)');

      this.limpiarFormulario();
      this.onDoctorSelectTurno();
    } finally {
      btn.disabled = false;
      btn.innerText = 'Registrar Paciente y Dar Turno';
    }
  },

  // ============================================================
  // LÓGICA DOCTOR
  // ============================================================

  async cargarPacientes() {
    const listEl = document.getElementById('patientList');
    if (listEl) listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">Cargando pacientes...</li>';

    let turnos = [];

    if (Estado.online && sb && Estado.doctorId) {
      try {
        const { data, error } = await sb
          .from('turnos')
          .select('*')
          .eq('doctor_id', Estado.doctorId)
          .in('estado', ['pendiente', 'en_consulta'])
          .order('numero_turno', { ascending: true });

        if (error) throw error;
        turnos = data || [];
        console.log('✅ Pacientes cargados de Supabase:', turnos.length);
      } catch (e) {
        console.warn('Error cargando desde Supabase, usando local:', e.message);
        turnos = Estado.turnosLocales.filter(
          t => t.doctor_id === Estado.doctorId && t.estado !== 'atendido'
        );
      }
    } else {
      turnos = Estado.turnosLocales.filter(
        t => t.doctor_id === Estado.doctorId && t.estado !== 'atendido'
      );
    }

    this.renderPacientes(turnos);
  },

  renderPacientes(turnos) {
    const listEl  = document.getElementById('patientList');
    const numEl   = document.getElementById('currentPatientNumber');
    const nameEl  = document.getElementById('currentPatientName');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!turnos || turnos.length === 0) {
      listEl.innerHTML = '<li class="patient-item" style="text-align:center;color:#666;">No hay pacientes en espera.</li>';
      if (numEl)  numEl.innerText = '--';
      if (nameEl) nameEl.innerText = 'Sala de espera vacía';
      return;
    }

    const enConsulta = turnos.find(t => t.estado === 'en_consulta');
    const proximo = enConsulta || turnos[0];
    if (numEl)  numEl.innerText = 'Turno #' + proximo.numero_turno;
    if (nameEl) {
      nameEl.innerText = proximo.paciente || 'Sin nombre';
      if (enConsulta) {
        nameEl.innerHTML += '<br><span style="font-size:.8rem;background:white;color:#0d47a1;padding:2px 10px;border-radius:12px;font-weight:bold;">EN CONSULTA</span>';
      }
    }

    turnos.forEach(t => {
      const ec = t.estado === 'en_consulta';
      let btns = '';
      if (t.estado === 'pendiente')    btns = `<button class="btn-action btn-call" onclick="app.cambiarEstado('${t.id}','en_consulta')">📢 Llamar</button>`;
      if (t.estado === 'en_consulta')  btns = `<button class="btn-action btn-done" onclick="app.cambiarEstado('${t.id}','atendido')">✅ Finalizar</button>`;

      // Desempacar JSON si existe
      let nombreReal = t.paciente || 'Sin nombre';
      let extra = {};
      if (nombreReal.includes('|||')) {
        const parts = nombreReal.split('|||');
        nombreReal = parts[0];
        try { extra = JSON.parse(parts[1]); } catch(e) {}
      }

      // Mostrar campo individual si existe localmente, si no usar el JSON desempacado
      const mostrarCedula      = t.cedula      || extra.cedula      || 'N/A';
      const mostrarEdad        = t.edad        ? t.edad + ' años' : (extra.edad ? extra.edad + ' años' : 'N/A');
      const mostrarPeso        = t.peso        || extra.peso        || 'N/A';
      const mostrarEstatura    = t.estatura    || extra.estatura    || 'N/A';
      const mostrarPresion     = t.presion     || extra.presion     || 'N/A';
      const mostrarTemperatura = t.temperatura || extra.temperatura || 'N/A';
      const mostrarFrecuencia  = t.frecuencia  || extra.frecuencia  || 'N/A';
      const mostrarSaturacion  = t.saturacion  || extra.saturacion  || 'N/A';
      const mostrarCelular     = t.celular     || extra.celular     || 'N/A';
      const mostrarCorreo      = t.correo      || extra.correo      || 'N/A';
      const mostrarCreadoPor   = t.creado_por  || extra.creado_por  || 'N/A';

      listEl.innerHTML += `
        <li class="patient-item ${ec ? 'en-consulta' : ''}">
          <div class="patient-header">
            <div>
              <div class="patient-title">Turno #${t.numero_turno} — ${nombreReal}</div>
              <div class="patient-subtitle">Ingresado por: ${mostrarCreadoPor}</div>
            </div>
            <div class="patient-actions">${btns}</div>
          </div>
          <div class="patient-data-grid">
            <div class="data-item"><span>Cédula</span><span>${mostrarCedula}</span></div>
            <div class="data-item"><span>Edad</span><span>${mostrarEdad}</span></div>
            <div class="data-item"><span>Peso</span><span>${mostrarPeso}</span></div>
            <div class="data-item"><span>Estatura</span><span>${mostrarEstatura}</span></div>
            <div class="data-item"><span>Presión Arterial</span><span>${mostrarPresion}</span></div>
            <div class="data-item"><span>Temperatura</span><span>${mostrarTemperatura}</span></div>
            <div class="data-item"><span>Frec. Cardíaca</span><span>${mostrarFrecuencia}</span></div>
            <div class="data-item"><span>Saturación O₂</span><span>${mostrarSaturacion}</span></div>
            <div class="data-item"><span>Celular</span><span>${mostrarCelular}</span></div>
            <div class="data-item"><span>Correo</span><span>${mostrarCorreo}</span></div>
          </div>
        </li>`;
    });
  },

  async cambiarEstado(turnoId, nuevoEstado) {
    if (Estado.online && sb) {
      try {
        const { error } = await sb.from('turnos')
          .update({ estado: nuevoEstado }).eq('id', turnoId);
        if (error) throw error;
      } catch (e) {
        console.error('Error actualizando estado:', e);
        this.toast('Error al actualizar', 'error');
        return;
      }
    } else {
      // Modo offline
      const t = Estado.turnosLocales.find(x => x.id === turnoId);
      if (t) t.estado = nuevoEstado;
    }

    if (nuevoEstado === 'en_consulta') this.toast('Paciente llamado', 'success');
    if (nuevoEstado === 'atendido')    this.toast('Consulta finalizada', 'success');

    // Recargar lista
    await this.cargarPacientes();
  },

  // ============================================================
  // TOAST
  // ============================================================
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
// ARRANQUE (sin DOMContentLoaded para evitar problemas de timing)
// ============================================================
function arrancarApp() {
  app.init();

  // Botones del modal
  const bDoc = document.getElementById('btnRoleDoctor');
  if (bDoc) bDoc.onclick = function() { app.selectRole('doctor'); };

  const bTur = document.getElementById('btnRoleTurnero');
  if (bTur) bTur.onclick = function() { app.selectRole('turnero'); };

  const bIngTur = document.getElementById('btnIngresarTurnero');
  if (bIngTur) bIngTur.onclick = function() { app.loginTurnero(); };

  const bIngDoc = document.getElementById('btnIngresarDoctor');
  if (bIngDoc) bIngDoc.onclick = function() { app.loginDoctor(); };

  // Enter en el campo de nombre
  const inp = document.getElementById('userNameInput');
  if (inp) inp.onkeypress = function(e) { if (e.key === 'Enter') app.loginTurnero(); };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarApp);
} else {
  arrancarApp();
}

window.app = app;
