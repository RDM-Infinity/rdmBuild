/*
=============================================
HELPER FUNCTIONS
=============================================
*/

//no-cache ajax
$.ajaxSetup({
	cache: false, //supposedly unnecessary for post requests, but meh
    headers: { "cache-control": "no-cache" }
});

//standard format for ajax request
function ajaxTemplate(data) {
	
	var ajaxObj = {
		url:		app.data.ajaxPath,
		data:		$.extend(data, app.data.ajaxAppend),
		type:		'post',
		async:		true,
		dataType:	'json',
		beforeSend:	function() {
						if (!'nospin' in data) {
							$("#spinner").show();
						}
					},
		complete:	function() {
						$("#spinner").hide();
					},
		success:	function (result) {
						//confirm that php is returning a status value
						if(result.status) {
							//execute pseudo-callback function if specified in result
							if(result.aftfn && result.aftvar) {
								if (aftvar = ajaxParse(result)) {
									//append api additions
									if ('api' in result && result.api) {
										$("#debug-api").append(result.api);
									}
									//execute callback if function exists
									if (result.aftfn in app.aftfn) {
										app.aftfn[result.aftfn](aftvar);
									}
								}
							}
						} else {
							console.log(request);
							console.warn("An unexpected error has occurred.");
							alert("An unexpected error occurred.");
						}
					},
		error:		function (request, error) {
						alert("Invalid server response.");
						setTimeout(function() {
							$("#spinner").fadeOut();
						}, 2000);
						console.log(request);
						console.error(error);
					}
	};
	
	//test for additional arguments to modify ajax object
	if (arguments.length > 1) {
		//loop through additional arguments, beginning at index 1
		for (var i=1; i<arguments.length; i++) {
			//apply conditional object syntax depending upon additional argument data
			switch (arguments[i]) {
				
				case "formdata":
					ajaxObj.processData = false;
					ajaxObj.contentType = false;
					break;
				
				case "noError":
					ajaxObj.error = function(request, error) {};
					break;
				
				default:
					//
				
			}
		}
	}
	
	$.ajax(ajaxObj);

}

//clean pick results and prompt with errors
function ajaxParse(result) {
	
	var response = result.aftvar;
	
	if (typeof response === "object") {
		
		if (('error' in response) && response.error.length) { //blank message does not get flagged as an error
			
			var errors = (response.error instanceof Array) ? response.error.join('<br />') : response.error;
			alert(errors);
			//real errors stop native processing
			result.aftfn += '_error';
			
		}
		
		else if ('notification' in response) {
			
			var notes = (response.notification instanceof Array) ? response.notification.join('<br />') : response.notification;
			alert(notes);
			
		}
		
		else if ('confirm' in response) {
			
			//deferred object
			var d1 = $.Deferred();
			
			//alert confirmation message
			var confirm = (response.confirm instanceof Array) ? response.confirm.join('<br />') : response.confirm;
			alert(
				confirm, //message
				{		 //settings
					id:			'pick-confirm',
					title:		'Confirm',
					buttons:	[
									{val: 1, text: 'Yes'},
									{val: 0, text: 'No'}
								],
					tapaway:	false,
					close:		false,
					callback:	function(val) {
									d1.resolve(parseInt(val));
								}
				}
			);
			
			//behave according to user response
			$.when(d1)
			 .then(function(answer) {
				if (answer) {
					//they said do it, punk
					app.aftfn[result.aftfn](recycleEmpties(response));
				}
				else {
					//how dare they tell you no
				}
			});
			
			//stop automatic processing, pending deferred response to confirmation dialog
			return false;
			
		}
		
	}
	
	//clean the results before sending them back
	return recycleEmpties(response);
	
}

//vertically position child object within parent object
function shifty(parent, child, position, speed, callback) {
	
	//measure everything
	var parentOffset	= $(parent).offset().top;
	var childOffset		= $(child).offset().top;
	var alreadyScrolled = $(parent).scrollTop();
	var dist			= childOffset + alreadyScrolled - parentOffset;
	var parentHeight	= $(parent).height();
	var childHeight		= $(child).height();
	var gap				= 0; //default to top
	
	//position = top, bottom, center (where the viewed child element sits in container after scroll)
	if (position == "top") {
		gap = 0;
	}
	else if (position == "bottom") {
		gap = parentHeight - childHeight;
	}
	else if (position == "center") {
		gap = Math.round((parentHeight - childHeight) / 2);
	}
	
	var scroll = dist - gap;
	$(parent).animate({scrollTop: scroll}, speed, callback);
	
}

//remove empty arrays from nested ojects and replace with empty strings
function recycleEmpties(data) {
	
	for (var k in data) {
		if (data[k] !== null && typeof data[k] == "object" && Object.keys(data[k]).length) {
			recycleEmpties(data[k]);
		}
		else if (data[k] instanceof Array) {
			if (data[k].length) {
				recycleEmpties(data[k]);
			}
			else {
				data[k] = '';
			}
		}
		else if (data[k] !== null && typeof data[k] == "object" && !Object.keys(data[k]).length) {
			data[k] = '';
		}
    }
	
	return data;
	
}

//clean up fields in container
function scrub(container, obliterate) {
	
	//all within container or only marked
	var filter = (obliterate) ? '*' : '[data-scrub]';
	
	$(container+' *').filter(filter).each(function(i, e) {
		
		//assign scrub value
		var scrub = $(e).data("scrub") || '';
		
		//hidden form fields not cleared by default on obliterate unless scrub attribute added
		if ($(e).is("input[type!='hidden']") || $(e).is("input[data-scrub]")) {
			if (($(e).is("input[type='checkbox']")) || ($(e).is("input[type='radio']"))) {
				$(e).prop('checked', false);
			}
			else {
				$(e).val(scrub);
			}
		}
		
		//select menus
		else if ($(e).is("select")) {
			$(e).val(scrub);
		}
		
		//text areas
		else if ($(e).is("textarea")) {
			$(e).val(scrub);
		}
		
		//tables not cleared by default on obliterate unless scrub attribute added
		else if ($(e).is("table[data-scrub]")) {
			$(e).find("tbody").html('');
		}
		
		//span not cleared by default on obliterate unless scrub attribute added
		else if ($(e).is("span[data-scrub]")) {
			$(e).html(scrub);
		}
		
	});
	
}

//create pagination block
function pagination(limit, offset, total) {
	
	var limit	= parseInt(limit),
		offset	= parseInt(offset),
		total	= parseInt(total);
		
	var html  =	'';
	
	if (total > limit) {
		html += '<li'+((offset==0) ? ' class="disabled"' : '')+'><a class="pagi" href="'+updateParameterByName('p', 1)+'">&laquo;</a></li>';
		var page = 0;
		var ellipsis = false;
		while((page * limit) < total) {
			//first five or last three
			if (page < 5 || (Math.ceil(total/limit) - page) < 4) {
				var linkOffset = page * limit;
				html += '<li'+((offset==linkOffset) ? ' class="active"' : '')+'><a class="pagi" href="'+updateParameterByName('p', page+1)+'">'+(page+1)+'</a></li>';
				ellipsis = false;
			}
			//within 2 of current
			else if ((Math.abs((page * limit) - offset) / limit) < 3) {
				var linkOffset = page * limit;
				html += '<li'+((offset==linkOffset) ? ' class="active"' : '')+'><a class="pagi" href="'+updateParameterByName('p', page+1)+'">'+(page+1)+'</a></li>';
				ellipsis = false;
			}
			//none of the display conditions met
			else {
				if (ellipsis == false) {
					html += '<li class="disabled"><a class="pagi">...</a></li>';
				}
				ellipsis = true;
			}
			page++;
		}
		html += '<li'+(((offset+limit) >= total) ? ' class="disabled"' : '')+'><a class="pagi" href="'+updateParameterByName('p', page)+'">&raquo;</a></li>';
	}
	
	$(".pagination").html(html);
	
	return html;
	
}

//parse uri query string to retrieve named parameter
function getParameterByName(name) {
	
	//current path
	var url = window.location.href;
	//clean up var
	name = name.replace(/[\[\]]/g, "\\$&");
	
	var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
		results = regex.exec(url);
	
	if (!results)		return null;
	if (!results[2])	return '';
	
	return decodeURIComponent(results[2].replace(/\+/g, " "));
	
}

//return uri string with parameter updated or inserted accordingly
function updateParameterByName(name, value) {
	
	var url = window.location.href;
	var re = new RegExp("([?&])" + name + "=.*?(&|$)", "i");
	var separator = url.indexOf('?') !== -1 ? "&" : "?";
	if (url.match(re)) {
		return url.replace(re, '$1' + name + "=" + value + '$2');
	}
	else {
		return url + separator + name + "=" + value;
	}
	
}

function formatNumber(number, decimals = 0, dec_point = ".", thousands_sep = ",") {
	// Strip all characters but numerical ones.
	number = (number + '').replace(/[^0-9+\-Ee.]/g, '');
	var n = !isFinite(+number) ? 0 : +number,
		prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
		sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
		dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
		s = '',
		toFixedFix = function(n, prec) {
			var k = Math.pow(10, prec);
			return '' + Math.round(n * k) / k;
		};
	// Fix for IE parseFloat(0.55).toFixed(0) = 0;
	s = (prec ? toFixedFix(n, prec) : '' + Math.round(n)).split('.');
	if(s[0].length > 3) {
		s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
	}
	if((s[1] || '').length < prec) {
		s[1] = s[1] || '';
		s[1] += new Array(prec - s[1].length + 1).join('0');
	}
	return s.join(dec);
}

function fileSize(size) {
	if(!size) return "0 B";
	const i = Math.floor(Math.log(size) / Math.log(1024));
	const value = (size / Math.pow(1024, i));
	return (i > 0 ? value.toFixed(2) : value) + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
}

//copy text to clipboard
function toClipboard(text) {
	
	if (!navigator.clipboard) {
		var textArea = document.createElement("textarea");
		textArea.value = text;

		//avoid scrolling to bottom
		textArea.style.top = "0";
		textArea.style.left = "0";
		textArea.style.position = "fixed";

		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		try {
			var successful = document.execCommand('copy');
			var msg = successful ? 'successful' : 'unsuccessful';
		} catch (err) {
			//
		}

		document.body.removeChild(textArea);
		return;
	}
	navigator.clipboard.writeText(text).then(function() {
		//
	}, function(err) {
		//
	});
	
}

//override alert method with bootstrap modal
window.alert = function(msg) {
	
	//object for modal contents
	var data = {
		id:			'alert'+(Math.floor(Math.random()*10000)),
		message:	msg,
		title:		'Alert',
		buttons:	'',
		backdrop:	'',
		size:       '',
		x:			'<button type="button" class="close" data-bs-dismiss="modal">&times;</button>',
		close:		'<button class="btn btn-default btn-alert" data-bs-dismiss="modal">Close</button>',
		callback:	function() {}
	};
	
	//additional data to customize modal dialog
	if (arguments.length > 1) {
		
		var args = (typeof arguments[1] === "object") ? arguments[1] : {};
		
		//custom id
		if ('id' in args) {
			data.id = args.id;
		}
		
		//custom title
		if ('title' in args) {
			data.title = args.title;
		}
		
		//custom footer buttons
		if ('buttons' in args) {
			if ($.isArray(args.buttons)) {
				var buttons = '';
				$.each(args.buttons, function(i, btn) {
					var btn_id = ('id' in btn) ? 'id="' + btn.id + '"' : '';
					var btn_text = ('text' in btn) ? btn.text : 'Button ' + (i+1);
					var btn_val = ('val' in btn) ? 'data-val="' + btn.val + '"' : '';
					buttons += '<button ' + btn_id + ' ' + btn_val + ' class="btn btn-default btn-alert" data-bs-dismiss="modal">' + btn_text + '</button>';
				});
				data.buttons = buttons;
			}
		}
		
		//custom size
		if ('size' in args) {
			data.size = 'modal-' + args.size;
		}
		
		//optionally disable tap outside to dismiss feature
		if ('tapaway' in args) {
			data.backdrop = (args.tapaway) ? '' : 'data-backdrop="static"';
			data.x = (args.tapaway) ? data.x : '';
		}
		
		//toggle close button in footer
		if ('close' in args) {
			data.close = (args.close) ? data.close : '';
		}
		
		//function to call after modal button is clicked (not triggered by arbitrary dismissal)
		if ('callback' in args) {
			if ($.isFunction(args.callback)) {
				data.callback = args.callback;
			}
		}
		
	}
	
	//build the pop-up modal
	var html = '<div class="modal fade alert-modal" tabindex="-1" role="dialog" ' + data.backdrop + ' id="' + data.id + '">'
			 + '	<div class="modal-dialog ' + data.size + '" role="document">'
			 + '		<div class="modal-content">'
			 + '			<div class="modal-header">'
			 + '			' + data.x
			 + '				<h4 class="modal-title">' + data.title + '</h4>'
			 + '			</div>'
			 + '			<div class="modal-body">' + data.message + '</div>'
			 + '			<div class="modal-footer">' + data.buttons + data.close + '</div>'
			 + '		</div>'
			 + '	</div>'
			 + '</div>';
	
	//stick it in the dom and bring it to life
	$("body").append(html);
	$(".alert-modal:first").modal("show");
	
	//alert button tap callback event listener
	$(document).on("click", "#"+data.id+" .btn-alert", function() { data.callback($(this).attr('data-val')) });
	
};

//when alert messages are dismissed, remove the modal from the dom
$(document).on("hidden.bs.modal", ".alert-modal", function() {
	
	$(this).remove();
	//chain the next one if it exists
	$(".alert-modal:first").modal("show");
	
});